# Final Fix for ValidationException

## The Real Problem
`restartAudioInput()` was closing empty audio content, causing ValidationException.

## The Real Solution
We DO need `restartAudioInput()` after each turn (to create fresh audio content for the next turn).

We just need to make sure it only closes the old content if it has data.

## Changes Made
1. **nova-stream.ts `restartAudioInput()`**: Only close audio content if `hasAudioData` is true
2. **nova-stream.ts `terminate()`**: Only close audio content if `isAudioStarted && hasAudioData` is true
3. **nova-stream.ts `close()`**: Only close audio content if `hasAudioData` is true

## Why This Works
- After turn 1 completes, `restartAudioInput()` is called
- If turn 1 had audio data, it closes that content
- Creates new empty audio content for turn 2
- Turn 2 audio is sent to the new content
- When user terminates, `terminate()` only closes if there's data

## Test Status
- ✅ Works with `hi.raw hi.raw` 
- ❓ Testing with `good_morning_nova.wav hi.raw`
