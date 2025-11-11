#!/usr/bin/env python3
"""
Unit tests for Python canary
"""
import pytest
import asyncio
import json
import base64
from pathlib import Path
from canary_cli import load_audio_file, save_audio_output

def test_load_audio_file():
    """Test loading and chunking audio files"""
    # Use a real audio file from the canary directory
    audio_file = '../canary/audio/hi.wav'
    
    if not Path(audio_file).exists():
        pytest.skip(f"Audio file {audio_file} not found")
    
    chunks = load_audio_file(audio_file)
    
    # Verify we got chunks
    assert len(chunks) > 0
    
    # Verify chunks are base64 strings
    for chunk in chunks:
        assert isinstance(chunk, str)
        # Should be decodable
        decoded = base64.b64decode(chunk)
        assert len(decoded) > 0

def test_save_audio_output(tmp_path):
    """Test saving audio output to WAV file"""
    # Create fake audio chunks
    fake_audio = b'\x00\x01' * 1000  # 2000 bytes of fake PCM data
    audio_b64 = base64.b64encode(fake_audio).decode('utf-8')
    chunks = [audio_b64]
    
    output_file = tmp_path / "test_output.wav"
    save_audio_output(chunks, str(output_file))
    
    # Verify file was created
    assert output_file.exists()
    
    # Verify it has WAV header + data
    with open(output_file, 'rb') as f:
        header = f.read(4)
        assert header == b'RIFF'

def test_audio_chunking_size():
    """Test that audio chunks are reasonable size"""
    audio_file = '../canary/audio/hi.wav'
    
    if not Path(audio_file).exists():
        pytest.skip(f"Audio file {audio_file} not found")
    
    chunks = load_audio_file(audio_file, chunk_size=4096)
    
    # Each chunk should be ~4096 chars (base64 encoded)
    for chunk in chunks[:-1]:  # All but last chunk
        assert len(chunk) <= 4096 + 100  # Allow some overhead

def test_canary_core_imports():
    """Test that canary_core can be imported"""
    from canary_core import run_two_turn_test
    assert callable(run_two_turn_test)

@pytest.mark.asyncio
async def test_canary_core_structure():
    """Test canary_core returns correct structure on error"""
    from canary_core import run_two_turn_test
    
    # Test with invalid URL (should fail fast)
    result = await run_two_turn_test(
        ws_url="ws://invalid-url-that-does-not-exist:9999",
        audio_chunks1=["fake"],
        audio_chunks2=["fake"],
        config={}
    )
    
    # Should return proper structure even on failure
    assert 'success' in result
    assert 'error' in result
    assert 'metrics' in result
    assert result['success'] == False
    assert result['error'] is not None

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
