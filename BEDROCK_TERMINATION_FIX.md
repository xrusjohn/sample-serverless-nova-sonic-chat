# Bedrock Session Termination Fix - FINAL

## Problem
ValidationException: "Cannot end content as no content data was received" when terminating session after turn 2.

## Root Cause
After turn 2 audioStop, `restartAudioInput()` creates empty turn 3 audio content. When user/canary sends `terminateSession`, agent's `terminate()` tried to close this empty content → ValidationException.

## Solution
**Fix `terminate()` to only close audio content if it has data:**

```typescript
// app/src/agent/nova-stream.ts
public terminate() {
  const promptName = this.promptName;
  
  // Only close audio content if it has data (to avoid ValidationException)
  if (this.isAudioStarted && this.hasAudioData) {
    this.eventQueue.push({
      event: { contentEnd: { promptName, contentName: this.audioContentId } }
    });
  }
  
  this.eventQueue.push({ event: { promptEnd: { promptName } } });
  this.eventQueue.push({ event: { sessionEnd: {} } });
  
  this.isActive = false;
  this.isAudioStarted = false;
  this.hasAudioData = false;
  this._stream = undefined;
}
```

## What We Keep (Don't Change)
- ✅ `restartAudioInput()` after audioStop - needed for web UI multi-turn
- ✅ `restartAudioInput()` ALWAYS closes old content (even if empty)
- ✅ `close()` only closes if hasAudioData

## Test Results
- ✅ `hi.raw hi.raw` - PASS (14s)
- ✅ `hi.raw good_morning_nova.wav` - PASS (Lambda canary uses this)
- ✅ No ValidationException errors
- ✅ Web UI multi-turn conversations work

## Files Modified
- `app/src/agent/nova-stream.ts` - Fixed `terminate()`
- `app/src/app/(root)/useSpeechToSpeech/index.ts` - Fixed TypeScript errors
- `canary/cli/.env` - Fixed endpoint configuration

## Known Issue: Bedrock Timeout
⚠️ **Remaining issue**: After turn 2, `restartAudioInput()` creates empty turn 3 content. If user doesn't send more audio, Bedrock times out after 59 seconds with "Timed out waiting for audio bytes" → InvocationClientError.

**Solution needed**: Add inactivity timeout (30s) after audioStop to call `terminate()` cleanly before Bedrock times out.

See: `TODO_BEDROCK_TIMEOUT.md` for details.

## Status: ✅ FIXED (terminate ValidationException)
⚠️ TODO: Fix Bedrock timeout InvocationClientError
