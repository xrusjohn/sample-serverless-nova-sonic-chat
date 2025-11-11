#!/usr/bin/env python3
"""
Shared canary core logic for Python WebSocket Nova Sonic testing.
Used by both CLI and Lambda handlers with 99% code sharing.
"""
import asyncio
import websockets
import json
import time
import base64
from typing import Dict, List, Any, Optional


async def run_two_turn_test(
    ws_url: str,
    audio_chunks1: List[str],
    audio_chunks2: List[str],
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Run a 2-turn conversation test against Nova Sonic WebSocket API.
    
    Args:
        ws_url: WebSocket URL (wss://...)
        audio_chunks1: List of base64-encoded audio chunks for turn 1
        audio_chunks2: List of base64-encoded audio chunks for turn 2
        config: Optional config with voice_id, system_prompt, etc.
    
    Returns:
        {
            'success': bool,
            'error': str or None,
            'metrics': {...},
            'turn1_audio': [base64 chunks],
            'turn2_audio': [base64 chunks],
            'transcript': [{'turn': int, 'text': str}]
        }
    """
    config = config or {}
    voice_id = config.get('voice_id', 'matthew')
    system_prompt = config.get('system_prompt', 'You are a helpful assistant.')
    
    start_time = time.time()
    metrics = {}
    transcript = []
    turn1_audio = []
    turn2_audio = []
    
    try:
        # Connect to WebSocket
        print(f"[CANARY] Connecting to {ws_url}...")
        connect_start = time.time()
        async with websockets.connect(ws_url) as ws:
            metrics['connect_time'] = (time.time() - connect_start) * 1000
            print(f"[CANARY] Connected in {metrics['connect_time']:.0f}ms")
            
            # Send sessionStart
            print("[CANARY] Sending sessionStart...")
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
            
            # Wait for ready
            print("[CANARY] Waiting for ready...")
            response = await asyncio.wait_for(ws.recv(), timeout=30)
            data = json.loads(response)
            print(f"[CANARY] Received: {list(data.get('event', {}).keys())}")
            if 'ready' not in data.get('event', {}):
                return {
                    'success': False,
                    'error': f'Expected ready event, got: {list(data.get("event", {}).keys())}',
                    'metrics': metrics,
                    'turn1_audio': [],
                    'turn2_audio': [],
                    'transcript': []
                }
            
            # Send promptStart ONCE for entire session
            print("[CANARY] Sending promptStart...")
            await ws.send(json.dumps({
                "event": {
                    "promptStart": {
                        "promptName": "session-prompt",
                        "textOutputConfiguration": {"mediaType": "text/plain"},
                        "audioOutputConfiguration": {
                            "mediaType": "audio/lpcm",
                            "sampleRateHertz": 24000,
                            "sampleSizeBits": 16,
                            "channelCount": 1,
                            "voiceId": voice_id,
                            "encoding": "base64",
                            "audioType": "SPEECH"
                        }
                    }
                }
            }))
            
            # Send system prompt
            print("[CANARY] Sending system prompt...")
            await ws.send(json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": "session-prompt",
                        "contentName": "system-content",
                        "type": "TEXT",
                        "interactive": False,
                        "role": "SYSTEM",
                        "textInputConfiguration": {"mediaType": "text/plain"}
                    }
                }
            }))
            await ws.send(json.dumps({
                "event": {
                    "textInput": {
                        "promptName": "session-prompt",
                        "contentName": "system-content",
                        "content": system_prompt
                    }
                }
            }))
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "session-prompt",
                        "contentName": "system-content"
                    }
                }
            }))
            
            # === TURN 1 ===
            current_turn = 1
            print(f"\n[CANARY] === Starting Turn {current_turn} ===")
            turn1_start = time.time()
            
            # Send contentStart for turn 1
            await ws.send(json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": "session-prompt",
                        "contentName": "audio-turn1",
                        "type": "AUDIO",
                        "interactive": True,
                        "role": "USER",
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
            
            # Send audio chunks
            print(f"[CANARY] Sending {len(audio_chunks1)} audio chunks...")
            send_start = time.time()
            for chunk in audio_chunks1:
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "session-prompt",
                            "contentName": "audio-turn1",
                            "content": chunk
                        }
                    }
                }))
            
            # DON'T send contentEnd yet - keep stream open for silence
            
            send_end = time.time()
            metrics['turn1_send_time'] = (send_end - send_start) * 1000
            
            # Collect turn 1 responses
            print("[CANARY] Waiting for turn 1 responses...")
            first_response_time = None
            turn1_user_text = []
            turn1_assistant_text = []
            audio_ended = False
            empty_audio_after_main = False
            
            while True:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    event_type = list(data.get('event', {}).keys())[0] if data.get('event') else None
                    
                    if first_response_time is None:
                        first_response_time = time.time()
                        metrics['turn1_reasoning_time'] = (first_response_time - send_end) * 1000
                    
                    # Log all events to debug
                    if event_type not in ['audioOutput', 'usageEvent']:
                        print(f"[CANARY:T{current_turn}] event: {event_type}")
                    
                    if event_type == 'completionEnd':
                        print(f"[CANARY:T{current_turn}] completionEnd - turn complete: {len(turn1_audio)} audio chunks")
                        break
                    elif event_type == 'contentEnd':
                        content_type = data['event']['contentEnd'].get('type')
                        print(f"[CANARY:T{current_turn}] contentEnd({content_type})")
                        if content_type == 'AUDIO':
                            if audio_ended:
                                # Second audio end without completionEnd - use this as fallback
                                print(f"[CANARY:T{current_turn}] Second contentEnd(AUDIO) - turn complete: {len(turn1_audio)} audio chunks")
                                break
                            audio_ended = True
                    elif event_type == 'audioOutput':
                        turn1_audio.append(data['event']['audioOutput']['content'])
                    elif event_type == 'textOutput':
                        role = data['event']['textOutput'].get('role', '').upper()
                        text = data['event']['textOutput'].get('content', data['event']['textOutput'].get('text', ''))
                        print(f"[CANARY:T{current_turn}] textOutput(role={role}): {text}")
                        if role == 'ASSISTANT':
                            turn1_assistant_text.append(text)
                        elif role == 'USER':
                            turn1_user_text.append(text)

                    
                except asyncio.TimeoutError:
                    return {
                        'success': False,
                        'error': 'Timeout waiting for turn 1 response',
                        'metrics': metrics,
                        'turn1_audio': turn1_audio,
                        'turn2_audio': [],
                        'transcript': transcript
                    }
            
            turn1_end = time.time()
            metrics['turn1_time'] = (turn1_end - turn1_start) * 1000
            metrics['turn1_receive_time'] = (turn1_end - first_response_time) * 1000
            
            if turn1_user_text or turn1_assistant_text:
                transcript.append({
                    'turn': 1,
                    'user': ''.join(turn1_user_text),
                    'assistant': ''.join(turn1_assistant_text)
                })
            
            # Calculate audio duration: 24kHz, 16-bit, mono
            total_bytes = sum(len(base64.b64decode(chunk)) for chunk in turn1_audio)
            samples = total_bytes / 2  # 16-bit = 2 bytes per sample
            audio_duration_sec = samples / 24000  # 24kHz sample rate
            
            # Stream silence for audio duration + 2s buffer
            silence_duration = audio_duration_sec + 2.0
            print(f"[CANARY:T{current_turn}] Turn 1 complete, streaming {silence_duration:.1f}s silence (audio: {audio_duration_sec:.1f}s + 2s buffer)...")
            
            # Generate silence: 16kHz, 16-bit, mono, 100ms chunks
            silence_chunk_samples = int(16000 * 0.1)
            silence_bytes = b'\x00' * (silence_chunk_samples * 2)
            silence_b64 = base64.b64encode(silence_bytes).decode('ascii')
            
            # Stream calculated silence duration
            num_chunks = int(silence_duration / 0.1)
            for _ in range(num_chunks):
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "session-prompt",
                            "contentName": "audio-turn1",
                            "content": silence_b64
                        }
                    }
                }))
                await asyncio.sleep(0.1)
            
            # NOW close turn 1 content
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "session-prompt",
                        "contentName": "audio-turn1"
                    }
                }
            }))
            
            # === TURN 2 ===
            current_turn = 2
            print(f"\n[CANARY] === Starting Turn {current_turn} ===")
            turn2_start = time.time()
            
            # Send contentStart for turn 2
            await ws.send(json.dumps({
                "event": {
                    "contentStart": {
                        "promptName": "session-prompt",
                        "contentName": "audio-turn2",
                        "type": "AUDIO",
                        "interactive": True,
                        "role": "USER",
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
            
            # Send audio chunks
            print(f"[CANARY] Sending {len(audio_chunks2)} audio chunks...")
            send_start = time.time()
            for chunk in audio_chunks2:
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "session-prompt",
                            "contentName": "audio-turn2",
                            "content": chunk
                        }
                    }
                }))
            
            # Send contentEnd for turn 2
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "session-prompt",
                        "contentName": "audio-turn2"
                    }
                }
            }))
            
            send_end = time.time()
            metrics['turn2_send_time'] = (send_end - send_start) * 1000
            
            # Collect turn 2 responses
            print("[CANARY] Waiting for turn 2 responses...")
            first_response_time = None
            turn2_user_text = []
            turn2_assistant_text = []
            audio_ended = False
            empty_audio_after_main = False
            
            while True:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    event_type = list(data.get('event', {}).keys())[0] if data.get('event') else None
                    
                    if first_response_time is None:
                        first_response_time = time.time()
                        metrics['turn2_reasoning_time'] = (first_response_time - send_end) * 1000
                    
                    # Log all events to debug
                    if event_type not in ['audioOutput', 'usageEvent']:
                        print(f"[CANARY:T{current_turn}] event: {event_type}")
                    
                    if event_type == 'completionEnd':
                        print(f"[CANARY:T{current_turn}] completionEnd - turn complete: {len(turn2_audio)} audio chunks")
                        break
                    elif event_type == 'contentEnd':
                        content_type = data['event']['contentEnd'].get('type')
                        print(f"[CANARY:T{current_turn}] contentEnd({content_type})")
                        if content_type == 'AUDIO':
                            if audio_ended:
                                # Second audio end - turn complete
                                print(f"[CANARY:T{current_turn}] Second contentEnd(AUDIO) - turn complete: {len(turn2_audio)} audio chunks")
                                break
                            # First audio end - mark it but keep collecting
                            audio_ended = True
                    elif event_type == 'audioOutput':
                        turn2_audio.append(data['event']['audioOutput']['content'])
                    elif event_type == 'textOutput':
                        role = data['event']['textOutput'].get('role', '').upper()
                        text = data['event']['textOutput'].get('content', data['event']['textOutput'].get('text', ''))
                        print(f"[CANARY:T{current_turn}] textOutput(role={role}): {text}")
                        if role == 'ASSISTANT':
                            turn2_assistant_text.append(text)
                        elif role == 'USER':
                            turn2_user_text.append(text)

                    
                except asyncio.TimeoutError:
                    return {
                        'success': False,
                        'error': 'Timeout waiting for turn 2 response',
                        'metrics': metrics,
                        'turn1_audio': turn1_audio,
                        'turn2_audio': turn2_audio,
                        'transcript': transcript
                    }
            
            turn2_end = time.time()
            metrics['turn2_time'] = (turn2_end - turn2_start) * 1000
            metrics['turn2_receive_time'] = (turn2_end - first_response_time) * 1000
            
            if turn2_user_text or turn2_assistant_text:
                transcript.append({
                    'turn': 2,
                    'user': ''.join(turn2_user_text),
                    'assistant': ''.join(turn2_assistant_text)
                })
            
            # Send promptEnd ONCE at end of session
            print("[CANARY] Sending promptEnd...")
            await ws.send(json.dumps({
                "event": {
                    "promptEnd": {
                        "promptName": "session-prompt"
                    }
                }
            }))
            
            # Send sessionEnd
            print("[CANARY] Sending sessionEnd...")
            await ws.send(json.dumps({"event": {"sessionEnd": {}}}))
            print("[CANARY] ✅ Test complete!")
            
            # Calculate total time
            metrics['total_time'] = (time.time() - start_time) * 1000
            metrics['audio_chunks_received'] = len(turn1_audio) + len(turn2_audio)
            
            return {
                'success': True,
                'error': None,
                'metrics': metrics,
                'turn1_audio': turn1_audio,
                'turn2_audio': turn2_audio,
                'transcript': transcript
            }
            
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'metrics': metrics,
            'turn1_audio': turn1_audio,
            'turn2_audio': turn2_audio,
            'transcript': transcript
        }
