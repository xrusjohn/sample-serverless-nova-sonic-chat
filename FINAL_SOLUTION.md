# Final Solution: Bedrock ValidationException Fix

## Problem
"Cannot end content as no content data was received" ValidationException when canary terminates session after turn 2.

## Root Cause
After turn 2 audioStop, `restartAudioInput()` creates an empty turn 3 audio content. When canary sends `terminateSession`, the agent's `terminate()` method tried to close this empty content, causing Bedrock ValidationException.

## Solution
**File**: `app/src/agent/nova-stream.ts`
**Method**: `terminate()`
**Fix**: Only close audio content if `isAudioStarted && hasAudioData`

```typescript
public terminate() {
  console.log('terminating session (user requested)');
  const promptName = this.promptName;
  
  // Only close audio content if it has data (to avoid ValidationException)
  if (this.isAudioStarted && this.hasAudioData) {
    console.log(`Closing audio content (hasData=${this.hasAudioData})`);
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
```

## What We Keep
- `restartAudioInput()` after audioStop - KEEP IT (needed for web UI multi-turn conversations)
- `restartAudioInput()` ALWAYS closes old content (even if empty) - CORRECT

## Test Results
✅ CLI canary passes: `hi.raw hi.raw` (14.2s)
✅ No ValidationException errors
✅ Canary metrics published successfully

## Files Modified
1. `app/src/agent/nova-stream.ts` - Fixed `terminate()` to check `hasAudioData`
2. `app/src/app/(root)/useSpeechToSpeech/index.ts` - Fixed TypeScript errors from schema union
3. `canary/cli/.env` - Fixed EVENT_API_ENDPOINT and added AGENT_HANDLER_FUNCTION_NAME

## TypeScript Fix (Side Issue)
When we changed schema from `discriminatedUnion` to regular `union` with catch-all, TypeScript couldn't narrow types properly. Fixed by declaring `const eventData = event.data as any` once at the top of the event handler.

## Deployment
```bash
cd cdk
npx cdk deploy ServerlessNovaSonicChatStack --require-approval never
```

## Verification
```bash
# Run CLI canary
cd canary/cli
node canary.js

# Check for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/ServerlessNovaSonicChatStack-AgentHandlerF75982B4-2QpEeKKhWJwV \
  --start-time $(($(date +%s)*1000 - 120000)) \
  --filter-pattern "ValidationException" | \
  jq -r 'if .events | length > 0 then .events[-1].message else "No errors" end'
```

## Status
✅ **FIXED** - No ValidationException errors, canary tests pass
