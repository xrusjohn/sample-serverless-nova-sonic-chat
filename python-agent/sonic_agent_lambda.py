import json
import os
import boto3
import asyncio
from typing import Dict, Any
from s2s_session_manager_full import S2sSessionManager
from s2s_events import S2sEvent

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])
bedrock_region = os.environ['BEDROCK_REGION']

# Session cache - survives across Lambda invocations in same container
sessions = {}

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
    Handle incoming messages. Each message is a separate Lambda invocation.
    Sessions are cached in module-level dict to survive across invocations.
    """
    try:
        domain_name = event['requestContext']['domainName']
        stage = event['requestContext']['stage']
        apigw_client = boto3.client(
            'apigatewaymanagementapi',
            endpoint_url=f"https://{domain_name}/{stage}"
        )
        
        body = json.loads(event.get('body', '{}'))
        event_type = list(body.get('event', {}).keys())[0] if body.get('event') else None
        print(f"Event: {event_type}")
        
        if event_type == 'sessionStart':
            asyncio.run(handle_session_start(connection_id, body, apigw_client))
        elif connection_id in sessions:
            asyncio.run(handle_stream_event(connection_id, body, apigw_client))
        
        return {'statusCode': 200, 'body': 'OK'}
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {'statusCode': 500, 'body': str(e)}

async def handle_session_start(connection_id: str, event_data: Dict, apigw_client):
    """Initialize Bedrock session and cache it"""
    session = S2sSessionManager(region=bedrock_region)
    await session.initialize_stream()
    sessions[connection_id] = session
    
    # Send to Bedrock
    await session.send_raw_event(event_data)
    
    # Send ready to client
    apigw_client.post_to_connection(
        ConnectionId=connection_id,
        Data=json.dumps({'event': {'ready': {}}, 'timestamp': 0}).encode('utf-8')
    )
    
    # Forward any immediate responses
    await forward_available_responses(connection_id, session, apigw_client)

async def handle_stream_event(connection_id: str, event_data: Dict, apigw_client):
    """Forward event to cached Bedrock session"""
    session = sessions[connection_id]
    await session.send_raw_event(event_data)
    
    event_type = list(event_data.get('event', {}).keys())[0]
    
    # After promptEnd, wait longer for all audio responses
    if event_type == 'promptEnd':
        await forward_available_responses(connection_id, session, apigw_client, timeout=10.0)
    else:
        # For other events, just drain immediate responses
        await forward_available_responses(connection_id, session, apigw_client, timeout=0.5)
    
    # Clean up on sessionEnd
    if event_type == 'sessionEnd':
        await session.close()
        del sessions[connection_id]

async def forward_available_responses(connection_id: str, session: S2sSessionManager, apigw_client, timeout: float = 0.1):
    """Forward all available responses from queue before Lambda returns"""
    deadline = asyncio.get_event_loop().time() + timeout
    
    while asyncio.get_event_loop().time() < deadline and session.is_active:
        try:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                break
            
            response = await asyncio.wait_for(session.output_queue.get(), timeout=remaining)
            
            apigw_client.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps(response).encode('utf-8')
            )
            
        except asyncio.TimeoutError:
            break
        except apigw_client.exceptions.GoneException:
            print(f"Connection gone")
            session.is_active = False
            break
        except Exception as e:
            print(f"Error forwarding: {e}")
            break
