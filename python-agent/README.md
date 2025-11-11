# Python WebSocket Agent (Parallel Stack)

This is a **parallel implementation** of the Nova Sonic agent using **API Gateway WebSocket** and **Python Lambda**, running alongside the existing AppSync Events + Node.js stack.

## Architecture

```
Python Clients → API Gateway WebSocket → Lambda (Python) → Bedrock Nova Sonic
```

vs. existing:

```
Web App (JS) → AppSync Events → Lambda (Node.js) → Bedrock Nova Sonic
```

## Why This Exists

- **Python ecosystem support**: Full native Python client/server
- **Team preference**: Python-focused teams and customers
- **Standard AWS pattern**: Follows AWS sample implementations
- **Parallel deployment**: Doesn't disrupt existing AppSync Events stack

## Deployment

### Deploy the Python WebSocket stack:

```bash
cd cdk
npx cdk deploy PythonWebSocketStack
```

This creates:
- API Gateway WebSocket API
- Python Lambda handler
- DynamoDB table for connection tracking
- IAM roles and permissions

### Get the WebSocket URL:

```bash
aws cloudformation describe-stacks \
  --stack-name PythonWebSocketStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketURL`].OutputValue' \
  --output text
```

## Testing

### Python Client Test:

```bash
cd python-agent
pip install websockets
python canary_client.py wss://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/production
```

### Manual WebSocket Test (wscat):

```bash
npm install -g wscat
wscat -c wss://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/production

# Send session start
{"event":{"sessionStart":{"systemPrompt":"You are helpful","voiceId":"tiffany"}}}
```

## Implementation Status

### ✅ Completed
- CDK stack with API Gateway WebSocket
- Python Lambda handler skeleton
- Connection management ($connect, $disconnect)
- Basic message routing

### 🚧 TODO (for full implementation)
- [ ] Bedrock streaming integration (see AWS sample: amazon-nova-samples)
- [ ] Audio chunking and queuing
- [ ] Session state management
- [ ] Tool use / MCP support
- [ ] Error handling and retries
- [ ] CloudWatch metrics
- [ ] Automated canary testing

## Comparison: AppSync Events vs API Gateway WebSocket

| Feature | AppSync Events (existing) | API Gateway WS (this) |
|---------|--------------------------|----------------------|
| Language | Node.js | Python |
| Client SDK | aws-amplify (JS only) | Any WebSocket client |
| Broadcasting | Built-in channels | Manual (loop connections) |
| Connection Mgmt | Automatic | DynamoDB tracking |
| Maturity | New (2024) | Mature (2018+) |
| Python Support | Server-side only | Full stack |

## Next Steps

1. **Complete Bedrock integration**: Use AWS sample code from `amazon-nova-samples/speech-to-speech/workshops/python-server`
2. **Add session management**: Track active sessions in DynamoDB
3. **Implement canary**: Automated testing like the Node.js canary
4. **Add monitoring**: CloudWatch metrics and alarms

## References

- [AWS Nova Sonic Python Sample](https://github.com/aws-samples/amazon-nova-samples/tree/main/speech-to-speech/workshops/python-server)
- [API Gateway WebSocket Tutorial](https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-chat-app.html)
- [AWS Powertools Python](https://docs.aws.amazon.com/powertools/python/latest/)
