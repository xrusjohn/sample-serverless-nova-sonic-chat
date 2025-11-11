# Python WebSocket Stack - Implementation Guide

## What We Built

A **parallel Python implementation** that runs alongside your existing AppSync Events stack:

```
┌─────────────────────────────────────────────────────────────┐
│  EXISTING STACK (Keep Running)                              │
│  Web App → AppSync Events → Lambda (Node.js) → Bedrock     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEW PYTHON STACK (Parallel)                                │
│  Python → API Gateway WS → Lambda (Python) → Bedrock        │
└─────────────────────────────────────────────────────────────┘
```

## Files Created

### CDK Infrastructure
- `cdk/lib/python-websocket-stack.ts` - CDK stack definition
- `cdk/bin/python-ws.ts` - Stack entry point

### Python Lambda
- `python-agent/handler.py` - Lambda handler (skeleton)
- `python-agent/requirements.txt` - Dependencies
- `python-agent/canary_client.py` - Test client
- `python-agent/README.md` - Documentation

## Quick Start

### 1. Deploy the Stack

```bash
cd cdk
npx cdk deploy PythonWebSocketStack
```

**Output:**
```
PythonWebSocketStack.WebSocketURL = wss://abc123.execute-api.us-east-1.amazonaws.com/production
```

### 2. Test with Python Client

```bash
cd python-agent
pip install websockets
python canary_client.py wss://YOUR-URL-HERE/production
```

### 3. Test with wscat

```bash
npm install -g wscat
wscat -c wss://YOUR-URL-HERE/production

# Send:
{"event":{"sessionStart":{"systemPrompt":"Hello","voiceId":"tiffany"}}}
```

## What's Implemented

✅ **Infrastructure**
- API Gateway WebSocket API
- Python Lambda handler
- DynamoDB connection tracking
- IAM permissions for Bedrock

✅ **Basic Functionality**
- WebSocket connection handling
- Message routing ($connect, $disconnect, $default)
- Connection state management

## What's NOT Implemented (Yet)

The handler is a **skeleton** - you need to add:

❌ **Bedrock Streaming** - Copy from AWS sample:
```python
# See: amazon-nova-samples/speech-to-speech/workshops/python-server/s2s_session_manager.py
```

❌ **Audio Processing** - Chunking, queuing, base64 handling

❌ **Session Management** - Track active sessions per connection

❌ **Error Handling** - Retries, timeouts, cleanup

## Integration with AWS Sample

The AWS sample (`amazon-nova-samples`) has the complete Bedrock streaming logic:

```bash
# Clone AWS sample
git clone https://github.com/aws-samples/amazon-nova-samples.git

# Copy the session manager
cp amazon-nova-samples/speech-to-speech/workshops/python-server/s2s_session_manager.py \
   python-agent/

# Adapt handler.py to use S2sSessionManager
```

## Deployment Options

### Option A: Standalone (New Stack)
```bash
npx cdk deploy PythonWebSocketStack
```
- Separate from existing stack
- Own DynamoDB table
- Independent lifecycle

### Option B: Integrated (Share Resources)
Modify `python-websocket-stack.ts`:
```typescript
// Pass existing table from main stack
new PythonWebSocketStack(app, 'PythonWebSocketStack', {
  table: existingTable,  // Share DynamoDB
  bedrockRegion: 'us-east-1',
});
```

## Cost Comparison

**API Gateway WebSocket:**
- $1.00 per million messages
- $0.25 per million connection minutes

**AppSync Events:**
- $1.00 per million requests
- $0.08 per million connection minutes

Both are similar in cost. WebSocket is slightly more expensive for connections but has broader ecosystem support.

## Migration Path (If Desired)

If you want to eventually migrate from AppSync Events to API Gateway WebSocket:

1. ✅ Deploy Python stack (done)
2. Complete Bedrock integration
3. Add feature parity (tools, MCP, etc.)
4. Test thoroughly with Python clients
5. Update web app to use WebSocket API
6. Deprecate AppSync Events stack

## Keeping Both Stacks

**Recommended approach:**
- Keep AppSync Events for web app (it works great)
- Use Python WebSocket for Python clients/canaries
- Both access same Bedrock models
- Separate connection management

## Next Steps

1. **Complete the handler**: Add Bedrock streaming from AWS sample
2. **Test end-to-end**: Audio in → Audio out
3. **Add canary**: Automated testing like Node.js version
4. **Document for team**: Python client examples

## Questions?

- AppSync Events vs WebSocket? See `python-agent/README.md`
- How to integrate AWS sample? See section above
- Cost concerns? Both are serverless, pay-per-use
- Which to use? Python stack for Python clients, AppSync for web
