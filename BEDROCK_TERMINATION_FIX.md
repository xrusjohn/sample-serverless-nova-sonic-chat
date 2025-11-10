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
- Only ends audio content if it has data (to avoid ValidationException client error)
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
  
  if (this.isAudioStarted) {
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

## Files Modified

- `app/src/agent/nova-stream.ts`: Added `terminate()` method, added `hasAudioData` tracking
- `app/src/agent/events.ts`: Changed terminateSession handler to call `terminate()`
- `canary/shared/canary-core.js`: Consolidated canary logic, waits for turn 2 audioStop
