#!/usr/bin/env python3
"""
Mock WebSocket agent for testing canary
Simulates Nova Sonic agent responses
"""
import asyncio
import websockets
import json
import base64

async def mock_agent_handler(websocket):
    """Handle WebSocket connection and simulate agent responses"""
    print("Client connected")
    
    try:
        async for message in websocket:
            data = json.loads(message)
            event_type = list(data.get('event', {}).keys())[0] if data.get('event') else None
            print(f"Received: {event_type}")
            
            if event_type == 'sessionStart':
                # Send ready
                await websocket.send(json.dumps({
                    'event': {'ready': {}},
                    'timestamp': 0
                }))
                print("Sent: ready")
                
            elif event_type == 'promptEnd':
                # Simulate agent response with audio
                # Send some fake audio chunks
                for i in range(3):
                    await websocket.send(json.dumps({
                        'event': {
                            'audioOutput': {
                                'content': base64.b64encode(b'\x00\x01' * 100).decode('utf-8')
                            }
                        },
                        'timestamp': i
                    }))
                    await asyncio.sleep(0.1)
                
                # Send audioStop
                await websocket.send(json.dumps({
                    'event': {'audioStop': {}},
                    'timestamp': 3
                }))
                print("Sent: audioOutput + audioStop")
                
            elif event_type == 'sessionEnd':
                print("Session ended")
                break
                
    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

async def run_mock_server(port=8765):
    """Run mock WebSocket server"""
    print(f"Starting mock agent on ws://localhost:{port}")
    async with websockets.serve(mock_agent_handler, "localhost", port):
        await asyncio.Future()  # Run forever

if __name__ == '__main__':
    asyncio.run(run_mock_server())
