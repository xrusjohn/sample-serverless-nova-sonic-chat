#!/usr/bin/env python3
"""Simple connection test to running agent"""
import asyncio
import websockets
import json

async def test_connection():
    try:
        print("Connecting to ws://localhost:9000...")
        async with websockets.connect("ws://localhost:9000", open_timeout=5) as ws:
            print("✓ Connected!")
            
            print("Sending sessionStart...")
            await ws.send(json.dumps({
                "event": {"sessionStart": {"inferenceConfiguration": {"maxTokens": 1024}}}
            }))
            
            print("Waiting for response...")
            response = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(response)
            print(f"✓ Received: {data}")
            
            print("Sending sessionEnd...")
            await ws.send(json.dumps({"event": {"sessionEnd": {}}}))
            
            print("✓ Test passed!")
            
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()

asyncio.run(test_connection())
