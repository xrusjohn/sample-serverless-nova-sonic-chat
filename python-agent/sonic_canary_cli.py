#!/usr/bin/env python3
"""
CLI wrapper for Python WebSocket canary testing.
Loads audio from local files and calls shared canary_core.
"""
import asyncio
import argparse
import base64
import sys
import json
from pathlib import Path
from datetime import datetime
from canary_core import run_two_turn_test
from audio_utils import audio_to_base64_chunks, strip_wav_header, create_wav_file


def load_audio_file(file_path: str, chunk_size: int = 4096) -> list:
    """Load audio file and convert to base64 chunks."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")
    
    with open(path, 'rb') as f:
        audio_data = f.read()
    
    audio_data = strip_wav_header(audio_data)
    return audio_to_base64_chunks(audio_data, chunk_size)


def save_audio_output(audio_chunks: list, output_path: str, sample_rate: int = 24000):
    """Save audio chunks to WAV file."""
    if not audio_chunks:
        return
    
    wav_data = create_wav_file(audio_chunks, sample_rate)
    with open(output_path, 'wb') as f:
        f.write(wav_data)


def print_results(result: dict):
    """Print test results to console."""
    print("\n" + "="*60)
    if result['success']:
        print("✅ CANARY TEST PASSED")
    else:
        print("❌ CANARY TEST FAILED")
        print(f"Error: {result['error']}")
    print("="*60)
    
    # Show transcript first (most important)
    if result['transcript']:
        print("\n💬 Conversation:")
        for entry in result['transcript']:
            turn_num = entry['turn']
            user_text = entry.get('user', '')
            assistant_text = entry.get('assistant', '')
            print(f"  Turn {turn_num}:")
            if user_text:
                print(f"    User: {user_text}")
            if assistant_text:
                print(f"    Assistant: {assistant_text}")
    
    metrics = result['metrics']
    print("\n📊 Timing Metrics:")
    print(f"  Total Time:           {metrics.get('total_time', 0):.0f} ms")
    print(f"  Connect Time:         {metrics.get('connect_time', 0):.0f} ms")
    print()
    print(f"  Turn 1 Total:         {metrics.get('turn1_time', 0):.0f} ms")
    print(f"    - Send Time:        {metrics.get('turn1_send_time', 0):.0f} ms")
    print(f"    - Reasoning Time:   {metrics.get('turn1_reasoning_time', 0):.0f} ms")
    print(f"    - Receive Time:     {metrics.get('turn1_receive_time', 0):.0f} ms")
    print()
    print(f"  Turn 2 Total:         {metrics.get('turn2_time', 0):.0f} ms")
    print(f"    - Send Time:        {metrics.get('turn2_send_time', 0):.0f} ms")
    print(f"    - Reasoning Time:   {metrics.get('turn2_reasoning_time', 0):.0f} ms")
    print(f"    - Receive Time:     {metrics.get('turn2_receive_time', 0):.0f} ms")
    print()
    print(f"  Audio Chunks Received: {metrics.get('audio_chunks_received', 0)}")
    print()


async def main():
    parser = argparse.ArgumentParser(
        description='Python WebSocket Canary CLI for Nova Sonic',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic test
  python canary_cli.py --ws-url wss://abc123.execute-api.us-east-1.amazonaws.com/production

  # Custom audio files
  python canary_cli.py --ws-url wss://... --audio1 turn1.wav --audio2 turn2.wav

  # Save recordings
  python canary_cli.py --ws-url wss://... --output-dir ./recordings

  # Custom voice
  python canary_cli.py --ws-url wss://... --voice ruth

  # Publish metrics to CloudWatch
  python canary_cli.py --ws-url wss://... --publish-metrics --aws-region us-east-1
        """
    )
    
    parser.add_argument('--ws-url', required=True, help='WebSocket URL (wss://...)')
    parser.add_argument('--audio1', default='../canary/audio/turn1.wav', help='First audio file')
    parser.add_argument('--audio2', default='../canary/audio/turn2.wav', help='Second audio file')
    parser.add_argument('--voice', default='matthew', help='Voice ID (matthew, ruth, tiffany)')
    parser.add_argument('--output-dir', help='Directory to save recordings')
    parser.add_argument('--turn-delay', type=float, default=2.0, help='Delay between turns (seconds)')
    parser.add_argument('--publish-metrics', action='store_true', help='Publish metrics to CloudWatch')
    parser.add_argument('--aws-region', help='AWS region for CloudWatch (default: from boto3 session)')
    
    args = parser.parse_args()
    
    try:
        # Load audio files
        print(f"📁 Loading audio files...")
        print(f"  Turn 1: {args.audio1}")
        print(f"  Turn 2: {args.audio2}")
        
        audio_chunks1 = load_audio_file(args.audio1)
        audio_chunks2 = load_audio_file(args.audio2)
        
        print(f"✓ Loaded {len(audio_chunks1)} chunks for turn 1")
        print(f"✓ Loaded {len(audio_chunks2)} chunks for turn 2")
        
        # Run test
        print(f"\n🚀 Starting 2-turn canary test...")
        print(f"  WebSocket: {args.ws_url}")
        print(f"  Voice: {args.voice}")
        
        result = await run_two_turn_test(
            ws_url=args.ws_url,
            audio_chunks1=audio_chunks1,
            audio_chunks2=audio_chunks2,
            config={
                'voice_id': args.voice,
                'turn_delay': args.turn_delay
            }
        )
        
        # Print results
        print_results(result)
        
        # Publish metrics to CloudWatch if requested
        if args.publish_metrics:
            try:
                from cloudwatch_metrics import publish_canary_metrics
                print("📊 Publishing metrics to CloudWatch...")
                publish_canary_metrics(
                    metrics=result['metrics'],
                    success=result['success'],
                    region=args.aws_region
                )
            except Exception as e:
                print(f"⚠️  Failed to publish metrics: {e}")
                print("   (Make sure AWS credentials are configured)")
        
        # Save recordings if requested
        if args.output_dir and result['success']:
            output_dir = Path(args.output_dir)
            timestamp = datetime.now().strftime('%Y-%m-%d-%H-%M-%S')
            session_dir = output_dir / timestamp
            session_dir.mkdir(parents=True, exist_ok=True)
            
            print(f"💾 Saving recordings to {session_dir}...")
            
            # Save turn 1 output
            if result['turn1_audio']:
                turn1_path = session_dir / 'turn1_output.wav'
                save_audio_output(result['turn1_audio'], str(turn1_path))
                print(f"  ✓ {turn1_path}")
            
            # Save turn 2 output
            if result['turn2_audio']:
                turn2_path = session_dir / 'turn2_output.wav'
                save_audio_output(result['turn2_audio'], str(turn2_path))
                print(f"  ✓ {turn2_path}")
            
            # Save transcript
            if result['transcript']:
                transcript_path = session_dir / 'transcript.json'
                with open(transcript_path, 'w') as f:
                    json.dump(result['transcript'], f, indent=2)
                print(f"  ✓ {transcript_path}")
            
            # Save metrics
            metrics_path = session_dir / 'metrics.json'
            with open(metrics_path, 'w') as f:
                json.dump(result['metrics'], f, indent=2)
            print(f"  ✓ {metrics_path}")
        
        # Exit with appropriate code
        sys.exit(0 if result['success'] else 1)
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
