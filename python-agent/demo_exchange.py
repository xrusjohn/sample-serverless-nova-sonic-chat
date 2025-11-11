#!/usr/bin/env python3
"""
Demo script showing the detailed 2-turn message exchange
"""
import asyncio
import websockets
import json
import base64
from pathlib import Path

async def demo_two_turn_exchange():
    """Show detailed message exchange for 2-turn conversation"""
    
    print("=" * 70)
    print("NOVA SONIC 2-TURN CONVERSATION PROTOCOL")
    print("=" * 70)
    print()
    
    # Load small audio file
    audio_file = Path('../canary/audio/hi.wav')
    with open(audio_file, 'rb') as f:
        audio_data = f.read()[44:]  # Skip WAV header
    audio_b64 = base64.b64encode(audio_data).decode('utf-8')
    audio_chunks = [audio_b64[i:i+4096] for i in range(0, len(audio_b64), 4096)]
    
    print(f"📁 Loaded audio: {len(audio_data)} bytes → {len(audio_chunks)} chunks")
    print()
    
    # Start mock server
    from test_mock_agent import mock_agent_handler
    server = await websockets.serve(mock_agent_handler, "localhost", 8767)
    
    try:
        async with websockets.connect("ws://localhost:8767") as ws:
            print("🔌 Connected to agent")
            print()
            
            # ===== SESSION START =====
            print("📤 CLIENT → AGENT: sessionStart")
            await ws.send(json.dumps({
                "event": {
                    "sessionStart": {
                        "inferenceConfiguration": {
                            "maxTokens": 1024,
                            "topP": 0.95,
                            "temperature": 0.7
                        }
                    }
                }
            }))
            
            response = await ws.recv()
            data = json.loads(response)
            print(f"📥 AGENT → CLIENT: {list(data['event'].keys())[0]}")
            print()
            
            # ===== TURN 1 =====
            print("🎯 TURN 1 START")
            print("-" * 70)
            
            print("📤 CLIENT → AGENT: promptStart")
            await ws.send(json.dumps({
                "event": {
                    "promptStart": {
                        "promptName": "user-prompt-1",
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
            }))
            
            print("📤 CLIENT → AGENT: contentStart (audio)")
            await ws.send(json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": "user-prompt-1",
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
            }))
            
            print(f"📤 CLIENT → AGENT: audioInput × {len(audio_chunks)} chunks")
            for chunk in audio_chunks:
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "user-prompt-1",
                            "contentName": "audio-1",
                            "content": chunk
                        }
                    }
                }))
            
            print("📤 CLIENT → AGENT: contentEnd")
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "user-prompt-1",
                        "contentName": "audio-1"
                    }
                }
            }))
            
            print("📤 CLIENT → AGENT: promptEnd")
            await ws.send(json.dumps({
                "event": {
                    "promptEnd": {
                        "promptName": "user-prompt-1"
                    }
                }
            }))
            
            print()
            print("⏳ Waiting for agent response...")
            
            audio_count = 0
            while True:
                response = await ws.recv()
                data = json.loads(response)
                event_type = list(data['event'].keys())[0]
                
                if event_type == 'audioOutput':
                    audio_count += 1
                    if audio_count == 1:
                        print(f"📥 AGENT → CLIENT: audioOutput (streaming...)")
                elif event_type == 'audioStop':
                    print(f"📥 AGENT → CLIENT: audioStop (received {audio_count} chunks)")
                    break
            
            print("✅ TURN 1 COMPLETE")
            print()
            
            # Wait between turns
            await asyncio.sleep(0.5)
            
            # ===== TURN 2 =====
            print("🎯 TURN 2 START")
            print("-" * 70)
            
            print("📤 CLIENT → AGENT: promptStart")
            await ws.send(json.dumps({
                "event": {
                    "promptStart": {
                        "promptName": "user-prompt-2",
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
            }))
            
            print("📤 CLIENT → AGENT: contentStart (audio)")
            await ws.send(json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": "user-prompt-2",
                        "contentName": "audio-2",
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
            }))
            
            print(f"📤 CLIENT → AGENT: audioInput × {len(audio_chunks)} chunks")
            for chunk in audio_chunks:
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "user-prompt-2",
                            "contentName": "audio-2",
                            "content": chunk
                        }
                    }
                }))
            
            print("📤 CLIENT → AGENT: contentEnd")
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "user-prompt-2",
                        "contentName": "audio-2"
                    }
                }
            }))
            
            print("📤 CLIENT → AGENT: promptEnd")
            await ws.send(json.dumps({
                "event": {
                    "promptEnd": {
                        "promptName": "user-prompt-2"
                    }
                }
            }))
            
            print()
            print("⏳ Waiting for agent response...")
            
            audio_count = 0
            while True:
                response = await ws.recv()
                data = json.loads(response)
                event_type = list(data['event'].keys())[0]
                
                if event_type == 'audioOutput':
                    audio_count += 1
                    if audio_count == 1:
                        print(f"📥 AGENT → CLIENT: audioOutput (streaming...)")
                elif event_type == 'audioStop':
                    print(f"📥 AGENT → CLIENT: audioStop (received {audio_count} chunks)")
                    break
            
            print("✅ TURN 2 COMPLETE")
            print()
            
            # ===== SESSION END =====
            print("📤 CLIENT → AGENT: sessionEnd")
            await ws.send(json.dumps({"event": {"sessionEnd": {}}}))
            
            print()
            print("=" * 70)
            print("✅ 2-TURN CONVERSATION COMPLETE")
            print("=" * 70)
            
    finally:
        server.close()
        await server.wait_closed()

if __name__ == '__main__':
    asyncio.run(demo_two_turn_exchange())
