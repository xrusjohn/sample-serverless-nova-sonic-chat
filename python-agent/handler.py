import json
import os
import boto3
import asyncio
from typing import Dict, Any
from s2s_session_manager_full import S2sSessionManager

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])
bedrock_region = os.environ['BEDROCK_REGION']

# API Gateway Management API client (initialized per request)
apigw_client = None

# Active sessions (connection_id -> SessionManager)
active_sessions = {}

# Background task to forward responses to WebSocket
async def forward_to_websocket(connection_id: str, session: S2sSessionManager):
    """Forward Bedrock responses to WebSocket client"""
    try:
        while session.is_active:
            response = await session.output_queue.get()
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps(response).encode('utf-8')
                )
            except apigw_client.exceptions.GoneException:
                print(f"Connection {connection_id} gone")
                session.is_active = False
                break
    except Exception as e:
        print(f"Error forwarding: {e}")

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle WebSocket events from API Gateway.
    Routes: $connect, $disconnect, $default
    """
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')
    
    print(f"Route: {route_key}, ConnectionId: {connection_id}")
    
    if route_key == '$connect':
        return handle_connect(connection_id, event)
    elif route_key == '$disconnect':
        return handle_disconnect(connection_id)
    elif route_key == '$default':
        return handle_message(connection_id, event, context)
    
    return {'statusCode': 400, 'body': 'Unknown route'}

def handle_connect(connection_id: str, event: Dict[str, Any]) -> Dict[str, Any]:
    """Store connection in DynamoDB"""
    try:
        table.put_item(Item={
            'connectionId': connection_id,
            'timestamp': event.get('requestContext', {}).get('requestTimeEpoch', 0)
        })
        return {'statusCode': 200, 'body': 'Connected'}
    except Exception as e:
        print(f"Error connecting: {e}")
        return {'statusCode': 500, 'body': str(e)}

def handle_disconnect(connection_id: str) -> Dict[str, Any]:
    """Remove connection from DynamoDB"""
    try:
        table.delete_item(Key={'connectionId': connection_id})
        return {'statusCode': 200, 'body': 'Disconnected'}
    except Exception as e:
        print(f"Error disconnecting: {e}")
        return {'statusCode': 500, 'body': str(e)}

def handle_message(connection_id: str, event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle incoming messages and stream Bedrock responses.
    Message format: {"event": {"sessionStart": {...}}, ...}
    """
    try:
        # Initialize API Gateway Management API client
        global apigw_client, active_sessions
        domain_name = event['requestContext']['domainName']
        stage = event['requestContext']['stage']
        apigw_client = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=f"https://{domain_name}/{stage}"
        )
        
        # Parse message
        body = json.loads(event.get('body', '{}'))
        print(f"Received message: {json.dumps(body)[:200]}")
        
        # Handle different event types
        if 'event' in body:
            event_type = list(body['event'].keys())[0]
            
            if event_type == 'sessionStart':
                # Create new session
                session = S2sSessionManager(region=bedrock_region)
                active_sessions[connection_id] = session
                
                # Initialize stream and start forwarding
                async def start():
                    await session.initialize_stream()
                    # Send ready event
                    apigw_client.post_to_connection(
                        ConnectionId=connection_id,
                        Data=json.dumps({'event': {'ready': {}}, 'timestamp': 0}).encode('utf-8')
                    )
                    # Start forwarding responses
                    asyncio.create_task(forward_to_websocket(connection_id, session))
                
                asyncio.run(start())
                
            elif event_type == 'audioInput':
                # Add audio to session
                if connection_id in active_sessions:
                    audio_event = body['event']['audioInput']
                    session = active_sessions[connection_id]
                    session.add_audio_chunk(
                        audio_event['promptName'],
                        audio_event['contentName'],
                        audio_event['content']
                    )
                    
            elif event_type == 'sessionEnd':
                # End session
                if connection_id in active_sessions:
                    session = active_sessions[connection_id]
                    asyncio.run(session.close())
                    del active_sessions[connection_id]
        
        return {'statusCode': 200, 'body': 'Message processed'}
    
    except Exception as e:
        print(f"Error handling message: {e}")
        import traceback
        traceback.print_exc()
        return {'statusCode': 500, 'body': str(e)}


