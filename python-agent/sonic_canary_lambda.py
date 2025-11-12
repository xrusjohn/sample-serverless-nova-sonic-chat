#!/usr/bin/env python3
"""
Lambda handler for scheduled Python WebSocket canary tests.
Uses shared canary_core logic (99% code sharing with CLI).
"""
import asyncio
import json
import os
import boto3
from datetime import datetime
from typing import Dict, Any
from canary_core import run_two_turn_test
from cloudwatch_metrics import publish_canary_metrics
from audio_utils import audio_to_base64_chunks, strip_wav_header, create_wav_file

s3 = boto3.client('s3')


def load_audio_from_s3(bucket: str, key: str) -> list:
    """Load audio file from S3 and convert to base64 chunks."""
    response = s3.get_object(Bucket=bucket, Key=key)
    audio_data = response['Body'].read()
    audio_data = strip_wav_header(audio_data)
    return audio_to_base64_chunks(audio_data)


def save_audio_to_s3(audio_chunks: list, bucket: str, key: str, sample_rate: int = 24000):
    """Save audio chunks to S3 as WAV file."""
    if not audio_chunks:
        return
    
    wav_data = create_wav_file(audio_chunks, sample_rate)
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=wav_data,
        ContentType='audio/wav'
    )


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for scheduled canary tests.
    Runs 2-turn conversation test and publishes metrics.
    """
    print("[CANARY] Starting Python WebSocket canary test...")
    
    # Get configuration from environment
    ws_url = os.environ['WS_URL']
    audio_bucket = os.environ['AUDIO_BUCKET']
    audio_file1 = os.environ.get('AUDIO_FILE1', 'turn1.wav')
    audio_file2 = os.environ.get('AUDIO_FILE2', 'turn2.wav')
    recordings_bucket = os.environ['RECORDINGS_BUCKET']
    voice_id = os.environ.get('VOICE_ID', 'matthew')
    
    print(f"[CANARY] WebSocket URL: {ws_url}")
    print(f"[CANARY] Audio bucket: {audio_bucket}")
    print(f"[CANARY] Voice: {voice_id}")
    
    try:
        # Load audio files from S3
        print(f"[CANARY] Loading audio files from S3...")
        audio_chunks1 = load_audio_from_s3(audio_bucket, audio_file1)
        audio_chunks2 = load_audio_from_s3(audio_bucket, audio_file2)
        print(f"[CANARY] Loaded {len(audio_chunks1)} chunks for turn 1")
        print(f"[CANARY] Loaded {len(audio_chunks2)} chunks for turn 2")
        
        # Run test
        print(f"[CANARY] Running 2-turn test...")
        result = asyncio.run(run_two_turn_test(
            ws_url=ws_url,
            audio_chunks1=audio_chunks1,
            audio_chunks2=audio_chunks2,
            config={'voice_id': voice_id}
        ))
        
        # Log results
        if result['success']:
            print(f"[CANARY] ✅ Test PASSED")
        else:
            print(f"[CANARY] ❌ Test FAILED: {result['error']}")
        
        print(f"[CANARY] Metrics: {json.dumps(result['metrics'], indent=2)}")
        
        # Publish metrics to CloudWatch
        print(f"[CANARY] Publishing metrics to CloudWatch...")
        publish_canary_metrics(
            metrics=result['metrics'],
            success=result['success']
        )
        
        # Save recordings to S3
        timestamp = datetime.utcnow().strftime('%Y-%m-%d-%H-%M-%S')
        session_prefix = f"recordings/{timestamp}"
        
        print(f"[CANARY] Saving recordings to S3: {recordings_bucket}/{session_prefix}")
        
        # Save turn 1 output
        if result['turn1_audio']:
            save_audio_to_s3(
                result['turn1_audio'],
                recordings_bucket,
                f"{session_prefix}/turn1_output.wav"
            )
        
        # Save turn 2 output
        if result['turn2_audio']:
            save_audio_to_s3(
                result['turn2_audio'],
                recordings_bucket,
                f"{session_prefix}/turn2_output.wav"
            )
        
        # Save transcript
        if result['transcript']:
            s3.put_object(
                Bucket=recordings_bucket,
                Key=f"{session_prefix}/transcript.json",
                Body=json.dumps(result['transcript'], indent=2),
                ContentType='application/json'
            )
        
        # Save metrics
        s3.put_object(
            Bucket=recordings_bucket,
            Key=f"{session_prefix}/metrics.json",
            Body=json.dumps(result['metrics'], indent=2),
            ContentType='application/json'
        )
        
        print(f"[CANARY] ✅ Canary test complete!")
        
        return {
            'statusCode': 200 if result['success'] else 500,
            'body': json.dumps({
                'success': result['success'],
                'error': result['error'],
                'metrics': result['metrics'],
                'recordings_path': f"s3://{recordings_bucket}/{session_prefix}"
            })
        }
        
    except Exception as e:
        print(f"[CANARY] ❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        
        # Publish failure metric
        try:
            publish_canary_metrics(
                metrics={},
                success=False
            )
        except:
            pass
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': str(e)
            })
        }
