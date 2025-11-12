#!/usr/bin/env python3
"""
Shared audio utilities for canary CLI and Lambda.
Handles loading, saving, and converting audio files.
"""
import base64
import struct
from typing import List


def audio_to_base64_chunks(audio_data: bytes, chunk_size: int = 4096) -> List[str]:
    """
    Convert raw audio data to base64-encoded chunks.
    
    Args:
        audio_data: Raw audio bytes (PCM, no header)
        chunk_size: Size of each base64 chunk
    
    Returns:
        List of base64-encoded strings
    """
    audio_b64 = base64.b64encode(audio_data).decode('utf-8')
    return [audio_b64[i:i+chunk_size] for i in range(0, len(audio_b64), chunk_size)]


def strip_wav_header(audio_data: bytes) -> bytes:
    """Remove WAV header if present (first 44 bytes)."""
    if audio_data[:4] == b'RIFF':
        return audio_data[44:]
    return audio_data


def create_wav_file(audio_chunks: List[str], sample_rate: int = 24000) -> bytes:
    """
    Create WAV file from base64 audio chunks.
    
    Args:
        audio_chunks: List of base64-encoded audio chunks
        sample_rate: Sample rate in Hz (default: 24000)
    
    Returns:
        Complete WAV file as bytes
    """
    if not audio_chunks:
        return b''
    
    # Decode base64 chunks
    audio_data = b''.join([base64.b64decode(chunk) for chunk in audio_chunks])
    
    # Create WAV header (16-bit PCM, mono)
    channels = 1
    sample_width = 2  # 16-bit
    data_size = len(audio_data)
    
    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        data_size + 36,
        b'WAVE',
        b'fmt ',
        16,  # fmt chunk size
        1,   # PCM
        channels,
        sample_rate,
        sample_rate * channels * sample_width,
        channels * sample_width,
        sample_width * 8,
        b'data',
        data_size
    )
    
    return header + audio_data
