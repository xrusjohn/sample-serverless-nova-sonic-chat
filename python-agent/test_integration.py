#!/usr/bin/env python3
"""
Integration test for canary against mock agent
"""
import pytest
import asyncio
import base64
from canary_core import run_two_turn_test
from test_mock_agent import mock_agent_handler
import websockets

@pytest.mark.asyncio
async def test_canary_against_mock_agent():
    """Test full canary flow against mock agent"""
    port = 8766
    
    # Start mock server
    server = await websockets.serve(mock_agent_handler, "localhost", port)
    
    try:
        # Create fake audio chunks
        fake_audio = base64.b64encode(b'\x00\x01' * 1000).decode('utf-8')
        audio_chunks = [fake_audio[i:i+4096] for i in range(0, len(fake_audio), 4096)]
        
        # Run canary test
        result = await run_two_turn_test(
            ws_url=f"ws://localhost:{port}",
            audio_chunks1=audio_chunks,
            audio_chunks2=audio_chunks,
            config={'voice_id': 'matthew', 'turn_delay': 0.5}
        )
        
        # Verify results
        assert result['success'] == True
        assert result['error'] is None
        
        # Verify metrics exist
        metrics = result['metrics']
        assert 'connect_time' in metrics
        assert 'turn1_time' in metrics
        assert 'turn2_time' in metrics
        assert 'total_time' in metrics
        
        # Verify we got audio responses
        assert len(result['turn1_audio']) > 0
        assert len(result['turn2_audio']) > 0
        
        print(f"✅ Test passed!")
        print(f"   Total time: {metrics['total_time']:.0f}ms")
        print(f"   Turn 1: {metrics['turn1_time']:.0f}ms")
        print(f"   Turn 2: {metrics['turn2_time']:.0f}ms")
        print(f"   Audio chunks: {metrics['audio_chunks_received']}")
        
    finally:
        server.close()
        await server.wait_closed()

if __name__ == '__main__':
    asyncio.run(test_canary_against_mock_agent())
