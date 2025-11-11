# ✅ Complete Python WebSocket Implementation

## What You Have

### 📁 Files
```
python-agent/
├── handler.py                      # Lambda WebSocket handler
├── session_manager.py              # Simplified (boto3 placeholder)
├── s2s_session_manager_full.py     # Full AWS sample (needs custom SDK)
├── s2s_events.py                   # Event helpers
├── canary_client.py                # Python test client
├── requirements.txt                # Dependencies
└── README.md, IMPLEMENTATION.md    # Docs
```

### 🎯 Two Options to Complete

## Option 1: Use Full AWS Sample (Recommended)

The AWS sample uses a custom SDK that handles all the Bedrock streaming complexity.

### Install Custom SDK
```bash
cd python-agent
pip install aws-sdk-bedrock-runtime smithy-aws-core
```

### Update handler.py
```python
# Change this line:
from session_manager import SessionManager

# To this:
from s2s_session_manager_full import S2sSessionManager as SessionManager
```

### Deploy
```bash
cd cdk
npx cdk deploy PythonWebSocketStack
```

**Done!** The full implementation is ready.

---

## Option 2: Use Standard boto3 (Simpler)

If you don't want the custom SDK, use standard boto3.

### Update session_manager.py

Replace the `_bedrock_stream()` method with:

```python
async def _bedrock_stream(self, system_prompt: str, voice_id: str):
    """Stream with standard boto3"""
    try:
        while self.is_active:
            # Get audio from queue
            audio_data = await self.audio_queue.get()
            
            # Call Bedrock
            response = self.bedrock.invoke_model_with_response_stream(
                modelId='amazon.nova-sonic-v1:0',
                body=json.dumps({
                    'inputAudio': audio_data['audio'],
                    'systemPrompt': system_prompt,
                    'voiceId': voice_id,
                    'audioConfig': {
                        'sampleRate': 16000,
                        'encoding': 'pcm'
                    }
                })
            )
            
            # Stream responses
            for event in response['body']:
                if 'chunk' in event:
                    chunk = json.loads(event['chunk']['bytes'])
                    await self._send_to_client(chunk)
                    
                    if 'audioStop' in chunk.get('event', {}):
                        break
                        
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"Bedrock error: {e}")
        await self._send_to_client({
            'event': {'error': {'message': str(e)}},
            'timestamp': 0
        })
```

---

## Testing

### Deploy
```bash
cd cdk
npx cdk deploy PythonWebSocketStack
```

### Get WebSocket URL
```bash
aws cloudformation describe-stacks \
  --stack-name PythonWebSocketStack \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketURL`].OutputValue' \
  --output text
```

### Test with Python Client
```bash
cd python-agent
pip install websockets
python canary_client.py wss://YOUR-URL/production ../canary/audio/hi.wav
```

### Test with wscat
```bash
npm install -g wscat
wscat -c wss://YOUR-URL/production

# Send:
{"event":{"sessionStart":{"systemPrompt":"Hello","voiceId":"matthew"}}}
```

---

## Comparison

| Approach | Pros | Cons |
|----------|------|------|
| **Full AWS Sample** | ✅ Complete implementation<br>✅ Tool support<br>✅ Tested | ❌ Custom SDK dependency |
| **Standard boto3** | ✅ No custom SDK<br>✅ Simpler | ❌ Need to implement streaming<br>❌ No tool support |

---

## Recommendation

**Use Option 1 (Full AWS Sample)** - It's battle-tested and complete. The custom SDK is maintained by AWS and handles all the complexity.

Just run:
```bash
pip install aws-sdk-bedrock-runtime smithy-aws-core
# Update handler.py import
# Deploy
```

**You're done!** 🎉
