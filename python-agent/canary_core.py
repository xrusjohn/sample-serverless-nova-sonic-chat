#!/usr/bin/env python3
"""
Shared canary core logic for Python WebSocket Nova Sonic testing.
Used by both CLI and Lambda handlers with 99% code sharing.
"""
import asyncio
import websockets
import json
import time
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
        connect_start = time.time()
        async with websockets.connect(ws_url) as ws:
            metrics['connect_time'] = (time.time() - connect_start) * 1000
            
            # Send sessionStart
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
            response = await asyncio.wait_for(ws.recv(), timeout=30)
            data = json.loads(response)
            if 'ready' not in data.get('event', {}):
                return {
                    'success': False,
                    'error': f'Expected ready event, got: {list(data.get("event", {}).keys())}',
                    'metrics': metrics,
                    'turn1_audio': [],
                    'turn2_audio': [],
                    'transcript': []
                }
            
            # === TURN 1 ===
            turn1_start = time.time()
            
            # Send promptStart
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
                            "voiceId": voice_id,
                            "encoding": "base64",
                            "audioType": "SPEECH"
                        }
                    }
                }
            }))
            
            # Send contentStart
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
            
            # Send audio chunks
            send_start = time.time()
            for chunk in audio_chunks1:
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "user-prompt-1",
                            "contentName": "audio-1",
                            "content": chunk
                        }
                    }
                }))
            
            # Send contentEnd
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "user-prompt-1",
                        "contentName": "audio-1"
                    }
                }
            }))
            
            # Send promptEnd
            await ws.send(json.dumps({
                "event": {
                    "promptEnd": {
                        "promptName": "user-prompt-1"
                    }
                }
            }))
            
            send_end = time.time()
            metrics['turn1_send_time'] = (send_end - send_start) * 1000
            
            # Collect turn 1 responses
            first_response_time = None
            turn1_text = []
            
            while True:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    event_type = list(data.get('event', {}).keys())[0] if data.get('event') else None
                    
                    if first_response_time is None:
                        first_response_time = time.time()
                        metrics['turn1_reasoning_time'] = (first_response_time - send_end) * 1000
                    
                    if event_type == 'audioOutput':
                        turn1_audio.append(data['event']['audioOutput']['content'])
                    elif event_type == 'textOutput':
                        turn1_text.append(data['event']['textOutput']['text'])
                    elif event_type == 'audioStop':
                        break
                    
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
            
            if turn1_text:
                transcript.append({'turn': 1, 'text': ''.join(turn1_text)})
            
            # Wait before turn 2
            await asyncio.sleep(config.get('turn_delay', 2))
            
            # === TURN 2 ===
            turn2_start = time.time()
            
            # Send promptStart
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
                            "voiceId": voice_id,
                            "encoding": "base64",
                            "audioType": "SPEECH"
                        }
                    }
                }
            }))
            
            # Send contentStart
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
            
            # Send audio chunks
            send_start = time.time()
            for chunk in audio_chunks2:
                await ws.send(json.dumps({
                    "event": {
                        "audioInput": {
                            "promptName": "user-prompt-2",
                            "contentName": "audio-2",
                            "content": chunk
                        }
                    }
                }))
            
            # Send contentEnd
            await ws.send(json.dumps({
                "event": {
                    "contentEnd": {
                        "promptName": "user-prompt-2",
                        "contentName": "audio-2"
                    }
                }
            }))
            
            # Send promptEnd
            await ws.send(json.dumps({
                "event": {
                    "promptEnd": {
                        "promptName": "user-prompt-2"
                    }
                }
            }))
            
            send_end = time.time()
            metrics['turn2_send_time'] = (send_end - send_start) * 1000
            
            # Collect turn 2 responses
            first_response_time = None
            turn2_text = []
            
            while True:
                try:
                    response = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(response)
                    event_type = list(data.get('event', {}).keys())[0] if data.get('event') else None
                    
                    if first_response_time is None:
                        first_response_time = time.time()
                        metrics['turn2_reasoning_time'] = (first_response_time - send_end) * 1000
                    
                    if event_type == 'audioOutput':
                        turn2_audio.append(data['event']['audioOutput']['content'])
                    elif event_type == 'textOutput':
                        turn2_text.append(data['event']['textOutput']['text'])
                    elif event_type == 'audioStop':
                        break
                    
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
            
            if turn2_text:
                transcript.append({'turn': 2, 'text': ''.join(turn2_text)})
            
            # Send sessionEnd
            await ws.send(json.dumps({"event": {"sessionEnd": {}}}))
            
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
