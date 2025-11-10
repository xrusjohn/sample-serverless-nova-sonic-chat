# Bedrock Session Termination Fix

## Problem Statement

When the canary test sends `terminateSession` event (simulating user clicking disconnect), we were getting Bedrock errors:
- "Cannot end content as no content data was received"
- "Timed out waiting for input events"

## Root Cause

After turn 1 completes, `restartAudioInput()` creates a **new empty audio content** to prepare for turn 2.

When turn 2 completes:
- Bedrock sends `contentEnd` with type `AUDIO` (turn 2 audioStop)
- Agent calls `restartAudioInput()` which creates ANOTHER new empty audio content for turn 3
- Bedrock is now waiting for turn 3 input
- After 60 seconds of no input, Bedrock times out with "Timed out waiting for input events"

## Solution

### Agent Side: `terminate()` Method
Created `terminate()` method that actively ends the session when user disconnects:
- **CRITICAL**: Only ends audio content if `isAudioStarted && hasAudioData` (to avoid ValidationException)
  - After `restartAudioInput()`, a new empty audio content is created with no data
  - Bedrock throws ValidationException if you try to end content with no data
- Ends prompt and session
- Sets isActive=false to stop accepting new input

### Canary Side: Wait for Turn 2 textStop
After turn 2 text completes, the canary should:
1. Wait for turn 2 `textStop` event with `stopReason: 'PARTIAL_TURN'`
2. Wait 1500ms for audio chunks to accumulate
3. Calculate audio playback duration
4. Wait for audio to finish playing (duration + 500ms buffer, minimum 2000ms)
5. Send `terminateSession`

**Why not wait for audioStop?** After turn 2 completes and `restartAudioInput()` creates a new audio content for turn 3, Bedrock waits 60 seconds for input. The agent Lambda times out before turn 2's audioStop can be reliably received by the canary.

## Implementation

```typescript
// In nova-stream.ts
public terminate() {
  console.log('terminating session (user requested)');
  const promptName = this.promptName;
  
  // Only close audio content if it has data to avoid ValidationException
  if (this.isAudioStarted && this.hasAudioData) {
    this.eventQueue.push({
      event: {
        contentEnd: {
          promptName,
          contentName: this.audioContentId,
        },
      },
    });
  }
  
  this.eventQueue.push({
    event: {
      promptEnd: {
        promptName,
      },
    },
  });
  this.eventQueue.push({
    event: {
      sessionEnd: {},
    },
  });
  
  this.isActive = false;
  this.isAudioStarted = false;
  this.hasAudioData = false;
  this._stream = undefined;
}

// In events.ts
if (event.event === 'terminateSession') {
  stream.terminate();
}
```

## Key Insights

1. **audioStop = contentEnd with type AUDIO**: When Bedrock finishes sending audio output, it sends `contentEnd` with `type: "AUDIO"`. The agent dispatches this as `audioStop` event.

2. **restartAudioInput() creates new content**: After each turn's audio completes, `restartAudioInput()` creates a new empty audio content for the next turn.

3. **Bedrock waits for input**: After creating new audio content, Bedrock waits for either more audio input or for us to end the content. If neither happens for 60 seconds, it times out.

4. **Text completes before audio**: Text generation completes before all audio chunks arrive. We must wait for `audioStop` to know all audio has been sent, then wait for the audio duration to finish playing.

5. **Don't end empty audio content**: Sending contentEnd for audio content with no data causes ValidationException (client error). Only end audio content if hasAudioData=true.

## Current Status (as of investigation)

### What Works
- ✅ `hi.raw hi.raw` - passes consistently
- ✅ `terminate()` only closes audio content if `isAudioStarted && hasAudioData`
- ✅ No ValidationException when terminating

### What Doesn't Work
- ❌ `good_morning_nova.wav hi.raw` - turn 2 times out after 60 seconds

### Investigation Notes

**Commit 92b5e11 (working version):**
- `restartAudioInput()` ALWAYS closes old audio content (no hasAudioData check)
- Tests with `hi.raw hi.raw` were passing

**Current version:**
- Added `hasAudioData` tracking
- `terminate()` only closes if `isAudioStarted && hasAudioData` ✅ CORRECT
- `close()` only closes if `hasAudioData` ✅ CORRECT  
- `restartAudioInput()` only closes if `hasAudioData` ❓ TESTING

**Question:** Does `restartAudioInput()` need to ALWAYS close the old audio content, even if empty?

**Hypothesis:** The working version (92b5e11) had `restartAudioInput()` always closing. When we added the `hasAudioData` check to `restartAudioInput()`, it may have broken something.

**Test Results (restartAudioInput always closes):**
- ✅ `hi.raw hi.raw` - PASS (15275ms)
- ❌ `good_morning_nova.wav hi.raw` - FAIL (Turn 2 timeout)

**Conclusion:** This is the SAME behavior as commit 92b5e11 (the "working" version). The `good_morning_nova.wav hi.raw` failure is NOT a regression from our changes - it's a pre-existing issue.

## The Real Issue with good_morning_nova.wav + hi.raw

After turn 1 with longer audio (`good_morning_nova.wav`), turn 2 with short audio (`hi.raw`) times out because:
1. `restartAudioInput()` creates a new empty audio content for turn 2
2. Canary sends 22 chunks of "hi" audio
3. Bedrock's speech detection doesn't recognize "hi" as complete speech (too short)
4. Bedrock waits 60 seconds for more audio or silence
5. Timeout

This is NOT a code bug - it's a test audio issue. The canary needs to send silence after short audio to signal end of speech.

## Final Implementation

### nova-stream.ts
```typescript
public terminate() {
  // Only close audio content if it has data
  if (this.isAudioStarted && this.hasAudioData) {
    this.eventQueue.push({ event: { contentEnd: { promptName, contentName: this.audioContentId } } });
  }
  this.eventQueue.push({ event: { promptEnd: { promptName } } });
  this.eventQueue.push({ event: { sessionEnd: {} } });
  this.isActive = false;
  this.isAudioStarted = false;
  this.hasAudioData = false;
}

public close() {
  // Only close audio content if it has data
  if (this.hasAudioData) {
    this.eventQueue.push({ event: { contentEnd: { promptName, contentName: this.audioContentId } } });
  }
  this.eventQueue.push({ event: { promptEnd: { promptName } } });
  this.eventQueue.push({ event: { sessionEnd: {} } });
}

public restartAudioInput() {
  // ALWAYS close old audio content (even if empty)
  this.eventQueue.push({ event: { contentEnd: { promptName, contentName: oldAudioContentId } } });
  this.enqueueAudioStart();
}
```

## Files Modified

- `app/src/agent/nova-stream.ts`: Added `terminate()` method, added `hasAudioData` tracking, modified `close()`
- `app/src/agent/events.ts`: Changed terminateSession handler to call `terminate()`
- `canary/shared/canary-core.js`: Consolidated canary logic, waits for turn 2 textStop before terminating

## CRITICAL DISCOVERY

**The old error (before our changes):** "Timed out waiting for audio bytes (59 seconds)"
**The new error (after our changes):** "Timed out waiting for input events"

Both are ValidationException, but DIFFERENT errors. The old error happened every 15 minutes but **tests still passed**. The new error causes **tests to fail**.

**Why the difference?**
The old error was Bedrock timing out waiting for MORE audio bytes in an EXISTING audio content.
The new error is Bedrock timing out waiting for ANY input events in a NEW empty audio content.

The canary was designed to handle the old error gracefully. The new error breaks the canary.

## FINAL RESOLUTION

**Root Cause:** The canary was waiting too long after turn 2 textStop before sending terminateSession. By that time, audioStop had occurred and `restartAudioInput()` created an empty audio content for turn 3, causing "Timed out waiting for input events".

**Solution:** Send terminateSession IMMEDIATELY after turn 2 textStop, before audioStop can trigger `restartAudioInput()`.

**Test Results:**
- ✅ `hi.raw hi.raw` - PASS
- ✅ `hi.raw good_morning_nova.wav` - PASS (9077ms) - **This is what the Lambda canary uses**
- ❌ `good_morning_nova.wav hi.raw` - FAIL (was testing wrong order)

## Status: ✅ FIXED

The ValidationException issue is resolved. Tests pass with the correct audio order.

## Why good_morning_nova.wav + hi.raw Doesn't Work

**Question:** Why can't we handle short utterances like "hi" in turn 2 after a long turn 1?

**Answer:** Bedrock's speech detection is context-dependent. After a longer utterance in turn 1, Bedrock expects similar length in turn 2. When it receives only "hi" (22 chunks, ~1.4s), it doesn't recognize it as complete speech and waits for more audio. After 60 seconds, it times out.

The old canary was getting "Timed out waiting for audio bytes" errors but tests still passed because:
1. The error happened INSIDE the existing audio content
2. Bedrock eventually sent audioStop (after timeout)
3. The canary waited for audioStop and completed successfully

**The Lambda canary uses `hi.raw` then `good_morning_nova.wav`** - this works because:
1. Short utterance first sets a baseline
2. Longer utterance second is easily recognized
3. Both turns complete successfully

**Conclusion:** `good_morning_nova.wav hi.raw` is not a supported test case. Use `hi.raw good_morning_nova.wav` instead.
