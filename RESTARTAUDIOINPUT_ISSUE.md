# restartAudioInput() Issue

## Problem
After every turn, we call `restartAudioInput()` which:
1. Closes the current audio content (if it has data)
2. Creates a NEW empty audio content

This causes:
- ValidationException when trying to close empty audio content
- Bedrock timeout waiting for input on the new empty content

## Why Are We Doing This?
Looking at `events.ts` line 169:
```typescript
} else if (jsonResponse.event?.contentEnd && jsonResponse.event?.contentEnd?.type === 'AUDIO') {
  await forcePublishAudioOutput(channel);
  stream.restartAudioInput();  // <-- Creates new audio content after every turn
  await dispatchEvent(channel, {
    event: 'audioStop',
    data: {},
  });
```

## Why Is This Wrong?
The webapp keeps the microphone open continuously - one audio content for the entire session. We should do the same.

## Solution
**Remove the `restartAudioInput()` call** after audioStop. Keep the same audio content open for the entire session.

The audio content is created once in `open()` via `enqueueAudioStart()` and should stay open until:
1. User terminates the session (`terminate()`), OR
2. Session naturally ends (`close()`)

## Benefits
1. No more empty audio content that causes ValidationException
2. No more Bedrock timeout waiting for input
3. Simpler code - matches how the webapp works
4. Fixes both the termination issue AND the turn 2 timeout issue

## Files Changed
- `app/src/agent/events.ts`: Removed `stream.restartAudioInput()` call after audioStop

## Test Results
- ✅ No more ValidationException "Cannot end content as no content data was received"
- ❌ Still times out with "Timed out waiting for input events" after 60 seconds

## Root Cause of Timeout
The timeout is NOT a code issue - it's that "hi.raw" (22 chunks, ~1.4 seconds) is too short for Bedrock's speech detection to recognize as complete speech. Bedrock waits for either:
1. More audio (silence detection indicates end of speech), OR
2. Explicit contentEnd

Since we removed `restartAudioInput()`, the audio content stays open and Bedrock waits for more input.

## Real Solution
We need BOTH fixes:
1. ✅ Keep audio content open (don't call `restartAudioInput()` after audioStop)
2. ✅ Only close audio content if it has data (in `terminate()` and `restartAudioInput()`)
3. ⚠️ For canary tests with short audio, we need a way to signal "end of speech"

## Options for Canary
1. Use longer audio files that Bedrock recognizes as complete speech
2. Add silence padding to short audio files
3. Add an explicit `endAudioInput` event that closes the audio content
