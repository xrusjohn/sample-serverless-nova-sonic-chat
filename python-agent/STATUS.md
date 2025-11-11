# Python Canary Status - End of Day

## What Works ✅

1. **Canary Core Logic** - 100% complete
   - 2-turn conversation protocol
   - 11 timing metrics
   - Audio collection and transcript extraction
   - 99% code sharing between CLI and Lambda

2. **Unit Tests** - All passing (5/5)
   - Audio loading/chunking
   - WAV file generation
   - Module imports

3. **Integration Test** - Passing (1/1)
   - Full 2-turn conversation with mock agent
   - All protocol messages verified

4. **WebSocket Agent** - Partially working
   - Connects to Bedrock successfully
   - Accepts client connections
   - Forwards messages bidirectionally
   - Credentials working (using environment variables)

5. **Infrastructure**
   - Python venv setup
   - Dependencies installed (websockets, boto3, aws-sdk-bedrock-runtime, smithy-aws-core)
   - Unbuffered logging working

## What Doesn't Work ❌

**Nova Sonic Not Responding**
- Agent sends all events to Bedrock
- Bedrock returns only `usageEvent`, no actual response (textOutput/audioOutput)
- Node.js canary works perfectly with same Bedrock setup
- Issue is in the event sequence sent by Python agent

## Root Cause Analysis

**Event Sequence Problem:**

**CRITICAL INSIGHT:** For multi-turn conversations, you send promptStart ONCE at the beginning, not per turn!

Correct sequence (ENTIRE SESSION):
```
1. sessionStart
2. promptStart (ONCE - with audio config)
3. System prompt (contentStart/textInput/contentEnd)
4. TURN 1: Audio content (contentStart/audioInput×N/contentEnd)
5. TURN 2: Audio content (contentStart/audioInput×N/contentEnd)
6. TURN N: Audio content (contentStart/audioInput×N/contentEnd)
7. promptEnd (ONCE at end)
8. sessionEnd
```

What the canary is doing WRONG:
```
1. sessionStart
2. TURN 1: promptStart → audio → promptEnd
3. TURN 2: promptStart → audio → promptEnd
4. sessionEnd
```

**The Problem:** The canary sends promptStart/promptEnd for EACH turn. It should send promptStart ONCE at the start, then just send audio content for each turn, then promptEnd ONCE at the end.

From AWS docs: "All audio frames share a single content container until the conversation ends and it is explicitly closed."

## AWS Sample Reference

Found official AWS sample showing correct sequence:
https://github.com/aws-samples/amazon-nova-samples/blob/main/speech-to-speech/repeatable-patterns/nova-sonic-speaks-first/src/client.ts

Key insight from lines 47-56:
```typescript
public async setupSessionAndPromptStart(): Promise<void> {
  this.client.setupSessionStartEvent(this.sessionId);
  this.client.setupPromptStartEvent(this.sessionId);  // ← Sent immediately
}

public async setupSystemPrompt(...): Promise<void> {
  this.client.setupSystemPromptEvent(...);  // ← Then system prompt
}
```

## Next Steps (Tomorrow)

1. **Fix Canary Protocol**
   - Send promptStart ONCE at session start (not per turn)
   - Send system prompt after promptStart
   - Send audio content for turn 1 (contentStart/audioInput×N/contentEnd)
   - Send audio content for turn 2 (contentStart/audioInput×N/contentEnd)
   - Send promptEnd ONCE at session end (not per turn)
   - Send sessionEnd

2. **Simplify Agent**
   - Agent just forwards everything from client to Bedrock
   - No need to inject anything - client sends correct sequence

3. **Test End-to-End**
   - Verify Nova Sonic responds
   - Check transcript display
   - Validate audio output

3. **Create Lambda Canary**
   - Wrap canary_core in Lambda handler
   - Add S3 upload for recordings
   - Add CloudWatch metrics

4. **Deploy to AWS**
   - CDK stack for Python agent (Lambda or ECS)
   - CDK stack for Lambda canary
   - EventBridge schedule for automated testing

## Files Created

```
python-agent/
├── canary_core.py              # ✅ Shared client logic (99% code)
├── canary_cli.py               # ✅ CLI wrapper
├── websocket_agent.py          # ⚠️  Agent (needs event sequence fix)
├── s2s_session_manager_full.py # ✅ Bedrock streaming
├── s2s_events.py               # ✅ Event helpers
├── test_canary.py              # ✅ Unit tests (5/5 passing)
├── test_integration.py         # ✅ Integration test (1/1 passing)
├── test_mock_agent.py          # ✅ Mock agent for testing
├── requirements.txt            # ✅ Dependencies
├── JOURNEY.md                  # ✅ Development journey
└── STATUS.md                   # ✅ This file
```

## Key Learnings

1. **Architecture**: Client (canary) ↔ Agent (broker) ↔ Nova Sonic
2. **Protocol**: ~30 messages per turn, bidirectional streaming
3. **Event Sequence**: Critical - must match AWS documentation exactly
4. **Credentials**: Custom SDK requires environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
5. **Testing**: Mock agent essential for development without Bedrock
6. **Logging**: Unbuffered output critical for debugging async code

## Estimated Time to Complete

- Fix event sequence: 30 minutes
- Test and verify: 30 minutes
- Lambda canary: 1 hour
- CDK deployment: 1 hour
- **Total: ~3 hours**

## Questions for Tomorrow

1. Should the Python agent be deployed as Lambda (with Function URL) or ECS?
2. What voice should the canary use? (currently hardcoded to 'matthew')
3. Should we add more audio test files?
4. Do we need CloudWatch alarms for canary failures?
