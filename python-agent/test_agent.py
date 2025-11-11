#!/usr/bin/env python3
"""
Unit test for WebSocket agent
"""
import pytest
import asyncio
import websockets
import json
from websocket_agent import handle_client

@pytest.mark.asyncio
async def test_agent_connection():
    """Test that agent accepts WebSocket connections"""
    port = 9876
    
    # Start agent server
    server = await websockets.serve(handle_client, "localhost", port)
    
    try:
        # Connect as client
        async with websockets.connect(f"ws://localhost:{port}") as ws:
            print("✓ Connected to agent")
            
            # Send sessionStart
            await ws.send(json.dumps({
                "event": {
                    "sessionStart": {
                        "inferenceConfiguration": {
                            "maxTokens": 1024
                        }
                    }
                }
            }))
            print("✓ Sent sessionStart")
            
            # Should receive ready (or error if Bedrock fails)
            response = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(response)
            print(f"✓ Received: {list(data.get('event', {}).keys())}")
            
            # Send sessionEnd
            await ws.send(json.dumps({"event": {"sessionEnd": {}}}))
            print("✓ Sent sessionEnd")
            
        print("✓ Test passed!")
        
    finally:
        server.close()
        await server.wait_closed()

if __name__ == '__main__':
    asyncio.run(test_agent_connection())
