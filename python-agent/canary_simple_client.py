#!/usr/bin/env python3
"""
Python WebSocket client for testing the Python WebSocket stack.
Can be used as a canary test or for general Python client access.
"""
import asyncio
import websockets
import json
import base64
from pathlib import Path

async def run_canary_test(websocket_url: str, audio_file: str):
    """
    Run a simple canary test against the WebSocket API.
    """
    async with websockets.connect(websocket_url) as ws:
        print(f"Connected to {websocket_url}")
        
        # 1. Send session start
        session_start = {
            "event": {
                "sessionStart": {
                    "inferenceConfiguration": {
                        "maxTokens": 1024,
                        "topP": 0.95,
                        "temperature": 0.7
                    }
                }
            }
        }
        await ws.send(json.dumps(session_start))
        print("Sent sessionStart")
        
        # Wait for ready event
        response = await ws.recv()
        data = json.loads(response)
        print(f"Received: {list(data.get('event', {}).keys())}")
        
        if 'ready' in data.get('event', {}):
            print("Agent is ready")
            
            # 2. Send prompt start
            prompt_start = {
                "event": {
                    "promptStart": {
                        "promptName": "user-prompt",
                        "textOutputConfiguration": {"mediaType": "text/plain"},
                        "audioOutputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 24000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "voiceId": "matthew",
                            "encoding": "base64",
                            "audioType": "SPEECH"
                        }
                    }
                }
            }
            await ws.send(json.dumps(prompt_start))
            print("Sent promptStart")
            
            # 3. Send content start (audio)
            content_start = {
                "event": {
                    "contentStart": {
                        "promptName": "user-prompt",
                        "contentName": "audio-1",
                        "type": "AUDIO",
                        "interactive": True,
                        "audioInputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 16000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "audioType": "SPEECH",
                            "encoding": "base64"
                        }
                    }
                }
            }
            await ws.send(json.dumps(content_start))
            print("Sent contentStart")
            
            # 4. Send audio input
            audio_path = Path(audio_file)
            if audio_path.exists():
                with open(audio_path, 'rb') as f:
                    audio_bytes = f.read()
                    audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
                
                audio_event = {
                    "event": {
                        "audioInput": {
                            "promptName": "user-prompt",
                            "contentName": "audio-1",
                            "content": audio_b64
                        }
                    }
                }
                await ws.send(json.dumps(audio_event))
                print("Sent audioInput")
                
                # 5. Send content end
                content_end = {
                    "event": {
                        "contentEnd": {
                            "promptName": "user-prompt",
                            "contentName": "audio-1"
                        }
                    }
                }
                await ws.send(json.dumps(content_end))
                print("Sent contentEnd")
                
                # 6. Send prompt end
                prompt_end = {
                    "event": {
                        "promptEnd": {
                            "promptName": "user-prompt"
                        }
                    }
                }
                await ws.send(json.dumps(prompt_end))
                print("Sent promptEnd")
                
                # Listen for responses
                timeout = 30
                start_time = asyncio.get_event_loop().time()
                
                while asyncio.get_event_loop().time() - start_time < timeout:
                    try:
                        response = await asyncio.wait_for(ws.recv(), timeout=5)
                        data = json.loads(response)
                        event_type = list(data.get('event', {}).keys())[0] if data.get('event') else 'unknown'
                        print(f"Received: {event_type}")
                        
                        if event_type == 'audioStop':
                            print("Audio response complete")
                            break
                    except asyncio.TimeoutError:
                        print("Waiting for response...")
            else:
                print(f"Audio file not found: {audio_file}")
        
        # Send session end
        session_end = {"event": {"sessionEnd": {}}}
        await ws.send(json.dumps(session_end))
        print("Sent sessionEnd")

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python canary_client.py <websocket_url> [audio_file]")
        print("Example: python canary_client.py wss://abc123.execute-api.us-east-1.amazonaws.com/production ../canary/audio/hi.wav")
        sys.exit(1)
    
    ws_url = sys.argv[1]
    audio_file = sys.argv[2] if len(sys.argv) > 2 else "../canary/audio/hi.wav"
    
    asyncio.run(run_canary_test(ws_url, audio_file))
