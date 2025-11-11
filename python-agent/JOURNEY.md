# Python Canary Development Journey

## The Goal
Create a Python canary system to test Nova Sonic agents, with 99% code sharing between CLI and Lambda.

## Key Insights Learned

### 1. Architecture Clarity: Client vs Agent

**Initial Confusion:** Tried to make the canary talk directly to Bedrock.

**Correct Understanding:**
```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   CLIENT    │ ←─WS──→ │    AGENT    │ ←─API──→ │ NOVA SONIC  │
│  (Canary)   │         │  (Broker)   │         │  (Bedrock)  │
└─────────────┘         └─────────────┘         └─────────────┘
```

- **Client (Front End)**: Canary CLI, Canary Lambda, Web Browser
- **Agent (Back End)**: Message broker/interpreter between client and Sonic
- **Nova Sonic**: Bedrock streaming API

The canary is a CLIENT that tests the AGENT, not Bedrock directly.

### 2. Protocol: Nova Sonic WebSocket Messages

**2-Turn Conversation Flow:**
```
Client → Agent: sessionStart
Agent → Client: ready

=== TURN 1 ===
Client → Agent: promptStart
Client → Agent: contentStart (audio config)
Client → Agent: audioInput × N chunks
Client → Agent: contentEnd
Client → Agent: promptEnd
Agent → Client: textOutput (transcript)
Agent → Client: audioOutput × N chunks (streaming)
Agent → Client: audioStop

=== TURN 2 ===
Client → Agent: promptStart
Client → Agent: contentStart
Client → Agent: audioInput × N chunks
Client → Agent: contentEnd
Client → Agent: promptEnd
Agent → Client: textOutput
Agent → Agent: audioOutput × N chunks
Agent → Client: audioStop

Client → Agent: sessionEnd
```

~30 messages per turn, bidirectional streaming.

### 3. Agent Implementation: Two Async Connections

The agent maintains TWO simultaneous async connections:
1. **WebSocket server** - Listens to client messages
2. **Bedrock streaming client** - Talks to Nova Sonic

The agent is a **message broker/interpreter**, not just a forwarder.

### 4. Lambda Challenges

**Problem with API Gateway WebSocket:**
- Each client message triggers a NEW Lambda invocation
- Each invocation has a NEW event loop
- Can't cache async objects (Bedrock session) across invocations
- Error: "Queue is bound to a different event loop"

**Solution:**
- Don't use API Gateway WebSocket
- Use standalone WebSocket server (Lambda Function URL, ECS, EKS, EC2)
- Single long-running process maintains both connections

### 5. Node.js vs Python Stacks

**Node.js Stack (Existing):**
- Uses AppSync Events (not WebSocket)
- Web browser clients
- Works great for web apps

**Python Stack (New):**
- Uses WebSocket protocol
- Python clients (CLI, Lambda canary)
- Can run anywhere (Lambda, ECS, EKS, local)

Both are valid - different protocols for different use cases.

## What We Built

### ✅ Completed

1. **canary_core.py** - Shared WebSocket client logic
   - 2-turn conversation protocol
   - 11 timing metrics
   - Audio collection
   - Transcript extraction

2. **canary_cli.py** - Command-line interface
   - Load audio from local files
   - Pretty-printed metrics
   - Save recordings to disk
   - Exit codes for CI/CD

3. **Unit Tests** - 5 tests passing
   - Audio loading/chunking
   - WAV file generation
   - Module imports

4. **Integration Test** - Full 2-turn test with mock agent
   - All protocol messages
   - Timing metrics
   - Audio responses

5. **Mock Agent** - For development/testing
   - Simulates Nova Sonic responses
   - Text + audio output

6. **websocket_agent.py** - Real agent implementation
   - Standalone WebSocket server
   - Bidirectional Bedrock streaming
   - Can run locally or in cloud

### 🚧 In Progress

1. **Agent Testing** - Verify agent works with real Bedrock
2. **End-to-end Test** - Canary → Agent → Bedrock
3. **Lambda Canary** - Scheduled testing wrapper
4. **CDK Infrastructure** - Deploy agent + canary

## Current Status

**Working:**
- ✅ Canary core logic (2-turn protocol, 11 metrics, audio collection)
- ✅ Canary CLI with verbose logging
- ✅ Unit tests (5/5 passing)
- ✅ Integration test with mock agent (1/1 passing)
- ✅ Agent connects to Bedrock successfully
- ✅ Agent accepts client connections
- ✅ Bidirectional message forwarding
- ✅ AWS credentials working (environment variables)

**Issue Found:**
- ❌ Nova Sonic not responding (only returns `usageEvent`)
- Root cause: Event sequence incorrect
- Agent waits for client's promptStart, should send its own immediately after sessionStart

**Next Steps:**
1. Fix agent event sequence (send promptStart after sessionStart)
2. Test end-to-end with real Bedrock
3. Create Lambda canary wrapper
4. Deploy to AWS

**See STATUS.md for detailed analysis and next steps**

## Development Setup

```bash
cd python-agent

# Create venv
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install pytest pytest-asyncio

# Run tests
pytest test_canary.py -v
pytest test_integration.py -v -s

# Test agent locally
python websocket_agent.py  # Terminal 1
python canary_cli.py --ws-url ws://localhost:9000 --audio1 ../canary/audio/hi.wav --audio2 ../canary/audio/hi.wav  # Terminal 2
```

## Files Created

```
python-agent/
├── canary_core.py              # Shared client logic (99% code)
├── canary_cli.py               # CLI wrapper
├── canary_simple_client.py     # Simple 1-turn test
├── websocket_agent.py          # Standalone agent server
├── test_canary.py              # Unit tests
├── test_integration.py         # Integration test
├── test_mock_agent.py          # Mock agent for testing
├── test_connect.py             # Simple connection test
├── demo_exchange.py            # Demo showing message flow
├── s2s_session_manager_full.py # Bedrock streaming (from AWS sample)
├── s2s_events.py               # Event helpers
├── requirements.txt            # Dependencies
└── venv/                       # Virtual environment
```

## Lessons Learned

1. **Always use venv** for Python projects
2. **Client vs Agent** - Understand the architecture layers
3. **Event loops** - Can't share async objects across Lambda invocations
4. **WebSocket vs AppSync Events** - Different protocols for different use cases
5. **Test incrementally** - Mock agent → Unit tests → Integration → Real agent
6. **Verbose logging** - Essential for debugging async WebSocket issues

## References

- [AWS Nova Sonic Sample](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech)
- [Nova Sonic Protocol Docs](https://docs.aws.amazon.com/nova/latest/userguide/what-is-nova.html)
- [WebSockets Python Library](https://websockets.readthedocs.io/)
