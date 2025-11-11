# TODO: Fix Bedrock Timeout InvocationClientError

## Problem
After turn 2 completes, `restartAudioInput()` creates an empty turn 3 audio content. If the user doesn't send more audio (because they're done), Bedrock waits 59 seconds then times out with:

```
ValidationException: Timed out waiting for audio bytes (59 seconds)
```

This generates an **InvocationClientError** in CloudWatch metrics, which is unacceptable.

## Current Behavior
1. Turn 2 audioStop occurs
2. Agent calls `restartAudioInput()` → creates empty turn 3 audio content
3. Bedrock waits for audio input
4. After 59 seconds: Bedrock timeout → InvocationClientError
5. Session ends with error

## Desired Behavior
Session should terminate cleanly when conversation is done, not wait for Bedrock timeout.

## Root Cause
We need `restartAudioInput()` for web UI multi-turn conversations, but it creates an empty content that Bedrock expects to receive data for.

## Potential Solutions

### Option A: Don't call `restartAudioInput()` after audioStop
**Pros**: No empty content, no timeout
**Cons**: Breaks web UI multi-turn conversations (web UI doesn't send `endAudioInput`)

### Option B: Add inactivity timeout on agent side
**Implementation**: After audioStop, start a timer (e.g., 30 seconds). If no audio input received, call `terminate()` to close session cleanly.
**Pros**: Prevents Bedrock timeout, works for both web UI and canary
**Cons**: Adds complexity, need to tune timeout value

### Option C: Web UI sends explicit "done" signal
**Implementation**: Modify web UI to send `terminateSession` or `endAudioInput` when user is done
**Pros**: Clean, explicit
**Cons**: Requires web UI changes, doesn't help with abandoned sessions

### Option D: Only call `restartAudioInput()` when user sends more audio
**Implementation**: Don't automatically restart after audioStop. Only restart when we receive new audio input from client.
**Pros**: No empty content unless needed
**Cons**: Need to handle the case where audio arrives but content isn't started yet

## Recommended Solution
**Option B** - Add 30-second inactivity timeout after audioStop:
1. After audioStop, start inactivity timer
2. If user sends audio → cancel timer, continue conversation
3. If timer expires → call `stream.terminate()` to close cleanly
4. This prevents Bedrock timeout and works for all scenarios

## Implementation Notes
- Timer should be in `processResponseStream()` or `NovaStream` class
- Timer should be cancelled if:
  - User sends audio input
  - User sends `terminateSession`
  - Session ends naturally
- Timeout value: 30 seconds (half of Bedrock's 59-second timeout)

## Impact
- ✅ Eliminates InvocationClientErrors from idle sessions
- ✅ Maintains web UI multi-turn support
- ✅ Canary tests unaffected (they terminate immediately)
- ⚠️ Adds complexity to session management

## Priority
**Medium** - Currently generating InvocationClientErrors but not breaking functionality. Should be fixed to clean up metrics.

## Status
📝 **Documented, not yet implemented**
