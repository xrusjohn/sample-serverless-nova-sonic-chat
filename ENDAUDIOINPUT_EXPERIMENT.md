# endAudioInput Event Experiment

## Problem
With `good_morning_nova.wav` (longer audio), turn 2 times out after 60 seconds with:
```
ValidationException: Timed out waiting for input events
```

Turn 2 audio (22 chunks of "hi.raw") is sent, but Bedrock doesn't recognize it as complete speech and waits for more audio.

## Root Cause
After turn 1 completes:
1. `restartAudioInput()` creates a new empty audio content for turn 2
2. Canary sends turn 2 audio (22 chunks)
3. Bedrock waits for either:
   - More audio chunks, OR
   - A `contentEnd` to close the audio content
4. After 60 seconds of no input, Bedrock times out

## Hypothesis
Adding an `endAudioInput` event that explicitly closes the audio content will allow short audio inputs to complete without waiting for Bedrock's speech detection timeout.

## Changes Made
1. **app/src/agent/events.ts**: Added `endAudioInput` event handler that calls `stream.restartAudioInput()`
2. **canary/shared/canary-core.js**: After sending turn 2 audio, wait 500ms then send `endAudioInput` event

## Expected Outcome
- Turn 2 should complete successfully with `good_morning_nova.wav` + `hi.raw`
- No timeout waiting for input events

## Test Results
[To be filled after testing]

## Decision
[Keep or revert based on test results]
