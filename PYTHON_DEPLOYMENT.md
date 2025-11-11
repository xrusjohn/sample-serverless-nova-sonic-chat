# Python WebSocket Stack - Deployment Guide

## Summary

Parallel Python implementation of Nova Sonic agent using API Gateway WebSocket instead of AppSync Events.

## Architecture

```
Node.js Stack (Existing):
  Web App → AppSync Events → AgentHandler (Node.js) → Bedrock

Python Stack (New):
  Python Client → API Gateway WS → AgentHandler (Python) → Bedrock
```

## Stack Details

**Stack Name**: `SonicAgentPythonStack`  
**Lambda Function**: `AgentHandler`  
**Full Function Name**: `SonicAgentPythonStack-AgentHandler...`

## Components

### Lambda Function
- **Runtime**: Python 3.12
- **Handler**: `handler.lambda_handler`
- **Code**: `python-agent/` directory
- **Timeout**: 15 minutes
- **Memory**: 1024 MB
- **Dependencies**: 
  - boto3
  - aws-sdk-bedrock-runtime (custom SDK)
  - smithy-aws-core (custom SDK)

### API Gateway WebSocket
- **Type**: WebSocket API
- **Stage**: production
- **Routes**: $connect, $disconnect, $default

### DynamoDB Table
- **Key**: connectionId
- **Billing**: Pay-per-request

## Files Created

```
cdk/
├── lib/python-websocket-stack.ts    # Stack definition
└── bin/python-ws.ts                 # Entry point

python-agent/
├── handler.py                       # Lambda handler
├── s2s_session_manager_full.py      # AWS sample session manager
├── s2s_events.py                    # Event helpers
├── canary_client.py                 # Test client
├── requirements.txt                 # Dependencies
└── README.md, COMPLETE.md           # Documentation
```

## Deployment

```bash
cd cdk
npx cdk deploy SonicAgentPythonStack
```

## Testing

```bash
# Get WebSocket URL from stack output
cd python-agent
pip install websockets
python canary_client.py wss://YOUR-URL/production ../canary/audio/hi.wav
```

## Naming Convention

| Component | Node.js | Python |
|-----------|---------|--------|
| Stack | ServerlessNovaSonicChatStack | SonicAgentPythonStack |
| Lambda | AgentHandler | AgentHandler |
| Protocol | AppSync Events | API Gateway WebSocket |
| Language | Node.js | Python 3.12 |

## Key Differences from Node.js Stack

1. **Protocol**: API Gateway WebSocket vs AppSync Events
2. **SDK**: Custom aws-sdk-bedrock-runtime vs standard AWS SDK
3. **Client**: Any WebSocket client vs aws-amplify
4. **Deployment**: Python code vs Docker image

## Next Steps

1. Deploy the stack
2. Test with Python client
3. Create SonicCanaryPython for automated testing
4. Add CloudWatch metrics and alarms
5. Document for team/customers

## Cost

Similar to Node.js stack:
- Lambda: Pay per invocation + duration
- API Gateway WebSocket: $1/million messages + $0.25/million connection minutes
- DynamoDB: Pay per request
- Bedrock: Pay per token

## Status

✅ Infrastructure ready  
✅ Handler implemented  
✅ AWS sample integrated  
✅ Test client created  
🚧 Canary Lambda (to be created)  
🚧 CloudWatch dashboard (to be created)
