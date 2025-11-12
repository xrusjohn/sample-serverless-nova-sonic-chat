#!/usr/bin/env python3
"""
Standalone WebSocket agent for Nova Sonic.
Runs as a WebSocket server, maintains bidirectional connection to Bedrock.
Can run locally, in Lambda, ECS, or anywhere Python runs.
"""
import sys
import asyncio
import websockets
import json
import os
import warnings
from s2s_session_manager_full import S2sSessionManager

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Suppress AWS CRT cleanup warnings
warnings.filterwarnings('ignore', message='.*CANCELLED.*')
warnings.filterwarnings('ignore', message='.*InvalidStateError.*')

BEDROCK_REGION = os.environ.get('BEDROCK_REGION', 'us-east-1')

async def handle_client(websocket):
    """
    Handle a single client connection.
    Maintains two async connections:
    1. WebSocket to client
    2. Bedrock streaming to Nova Sonic
    """
    print(f"[AGENT] Client connected from {websocket.remote_address}")
    session = None
    
    try:
        # Initialize Bedrock session
        print("[AGENT] Initializing Bedrock session...")
        session = S2sSessionManager(region=BEDROCK_REGION)
        await session.initialize_stream()
        print("[AGENT] Bedrock session initialized")
        
        # Start forwarding Bedrock responses to client
        print("[AGENT] Starting response forwarding task...")
        forward_task = asyncio.create_task(
            forward_bedrock_to_client(websocket, session)
        )
        
        # Process client messages and forward to Bedrock
        print("[AGENT] Waiting for client messages...")
        async for message in websocket:
            try:
                data = json.loads(message)
                event_type = list(data.get('event', {}).keys())[0] if data.get('event') else None
                
                # Extract client turn tag if present
                client_turn = data.get('_clientTurn', '')
                turn_label = f"T{client_turn}" if client_turn else "--"
                
                # Only log non-audio events
                if event_type not in ['audioInput']:
                    print(f"[AGENT:{turn_label}] Received from client: {event_type}")
                
                if event_type == 'sessionStart':
                    # Send to Bedrock
                    print("[AGENT] Forwarding sessionStart to Bedrock...")
                    await session.send_raw_event(data)
                    
                    # Send ready to client
                    print("[AGENT] Sending ready to client...")
                    await websocket.send(json.dumps({
                        'event': {'ready': {}},
                        'timestamp': 0
                    }))
                    print("[AGENT] Ready sent!")
                    
                elif event_type == 'sessionEnd':
                    # Forward to Bedrock and close
                    print("[AGENT] Forwarding sessionEnd to Bedrock...")
                    await session.send_raw_event(data)
                    print("[AGENT] Session ended by client")
                    break
                    
                else:
                    # Forward all other events to Bedrock (strip client tag)
                    if event_type not in ['audioInput']:
                        print(f"[AGENT:{turn_label}] Client→Bedrock: {event_type}")
                    # Remove client tag before forwarding to Bedrock
                    if '_clientTurn' in data:
                        data = {k: v for k, v in data.items() if k != '_clientTurn'}
                    await session.send_raw_event(data)
                    
            except json.JSONDecodeError as e:
                print(f"[AGENT] Invalid JSON: {e}")
            except Exception as e:
                print(f"[AGENT] Error processing message: {e}")
                import traceback
                traceback.print_exc()
        
        # Cancel forwarding task
        print("[AGENT] Cancelling forward task...")
        forward_task.cancel()
        try:
            await forward_task
        except asyncio.CancelledError:
            pass
            
    except websockets.exceptions.ConnectionClosed:
        print("[AGENT] Client disconnected")
    except Exception as e:
        print(f"[AGENT] Error handling client: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if session:
            print("[AGENT] Closing Bedrock session...")
            await session.close()
        print("[AGENT] Client connection closed")

async def forward_bedrock_to_client(websocket, session: S2sSessionManager):
    """Forward Bedrock responses to WebSocket client"""
    print("[FORWARD] Starting to forward Bedrock responses...")
    audio_ended = False
    
    try:
        while session.is_active:
            response = await asyncio.wait_for(session.output_queue.get(), timeout=300)
            
            event_type = list(response.get('event', {}).keys())[0] if response.get('event') else 'unknown'
            
            # Reset audio_ended on new completion
            if event_type == 'completionStart':
                audio_ended = False
            
            # Build display name with type for content events
            display_name = event_type
            if event_type in ['contentStart', 'contentEnd']:
                content_type = response.get('event', {}).get(event_type, {}).get('type', '')
                if content_type:
                    display_name = f"{event_type}({content_type})"
                if event_type == 'contentEnd' and content_type == 'AUDIO':
                    if audio_ended:
                        # Second audio end = turn complete
                        display_name += " [TURN_COMPLETE]"
                    audio_ended = True
            elif event_type == 'textOutput':
                role = response.get('event', {}).get('textOutput', {}).get('role', '')
                if role:
                    display_name = f"textOutput(role={role})"
            
            # Forward to client
            try:
                await websocket.send(json.dumps(response))
                
                # Log non-audio events
                if event_type not in ['audioOutput']:
                    print(f"[FORWARD] Bedrock→Client: {display_name}")
                
                # Check for session end
                if 'event' in response and 'sessionEnd' in response['event']:
                    print("[FORWARD] Session ended by Bedrock")
                    break
                    
            except websockets.exceptions.ConnectionClosed:
                print("[FORWARD] Client connection closed during forward")
                break
                
    except asyncio.TimeoutError:
        print("[FORWARD] Bedrock session timeout")
    except Exception as e:
        print(f"[FORWARD] Error forwarding: {e}")
        import traceback
        traceback.print_exc()

async def run_server(host='0.0.0.0', port=None):
    """Run WebSocket server"""
    # Use PORT env var for Lambda Web Adapter, default to 9000 for local
    port = port or int(os.environ.get('PORT', 9000))
    print(f"Starting Nova Sonic WebSocket agent on ws://{host}:{port}")
    async with websockets.serve(handle_client, host, port):
        print(f"[AGENT] Server ready and listening on ws://{host}:{port}")
        await asyncio.Future()  # Run forever

def handle_exception(loop, context):
    """Custom exception handler to suppress AWS CRT cleanup errors"""
    exception = context.get('exception')
    if exception:
        exc_str = str(exception)
        if 'CANCELLED' in exc_str or 'InvalidStateError' in exc_str:
            # Suppress expected AWS CRT cleanup errors
            return
    # Log other exceptions
    msg = context.get('message', 'Unhandled exception')
    if 'CANCELLED' not in msg and 'InvalidStateError' not in msg:
        print(f"[AGENT] Async exception: {msg}")
        if exception:
            print(f"[AGENT] Exception: {exception}")

if __name__ == '__main__':
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.set_exception_handler(handle_exception)
    
    try:
        loop.run_until_complete(run_server())
    except KeyboardInterrupt:
        print("\n[AGENT] Server stopped by user")
    except Exception as e:
        if "CANCELLED" not in str(e) and "InvalidStateError" not in str(e):
            print(f"[AGENT] Server error: {e}")
            import traceback
            traceback.print_exc()
    finally:
        loop.close()
