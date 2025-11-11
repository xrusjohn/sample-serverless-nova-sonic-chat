"""
Long-running agent Lambda - mirrors Node.js agent.
Invoked once per session, stays alive for entire conversation.
Connects to Bedrock and forwards messages bidirectionally.
"""
import json
import os
import boto3
import asyncio
from typing import Dict, Any
from s2s_session_manager_full import S2sSessionManager

bedrock_region = os.environ.get('BEDROCK_REGION', 'us-east-1')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Agent handler - invoked once per session (async invocation).
    Stays alive for entire conversation.
    """
    connection_id = event['connectionId']
    ws_endpoint = event['wsEndpoint']
    session_start = event['sessionStart']
    
    print(f"Agent starting for connection {connection_id}")
    
    # Run the session (blocks until complete)
    result = asyncio.run(run_agent_session(connection_id, ws_endpoint, session_start))
    
    return {'statusCode': 200, 'body': json.dumps(result)}

async def run_agent_session(connection_id: str, ws_endpoint: str, session_start: Dict):
    """
    Main agent loop - stays alive for entire conversation.
    """
    apigw_client = boto3.client('apigatewaymanagementapi', endpoint_url=ws_endpoint)
    session = None
    
    try:
        # Initialize Bedrock session
        session = S2sSessionManager(region=bedrock_region)
        await session.initialize_stream()
        print(f"Bedrock session initialized")
        
        # Send sessionStart to Bedrock
        await session.send_raw_event(session_start)
        
        # Send ready event to client
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps({'event': {'ready': {}}, 'timestamp': 0}).encode('utf-8')
        )
        print("Sent ready event")
        
        # Start two concurrent tasks:
        # 1. Forward Bedrock responses to WebSocket
        # 2. Poll DynamoDB for new messages from client
        forward_task = asyncio.create_task(
            forward_bedrock_to_websocket(connection_id, session, apigw_client)
        )
        poll_task = asyncio.create_task(
            poll_client_messages(connection_id, session)
        )
        
        # Wait for either task to complete
        done, pending = await asyncio.wait(
            [forward_task, poll_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cancel remaining tasks
        for task in pending:
            task.cancel()
        
        return {'success': True, 'connectionId': connection_id}
        
    except Exception as e:
        print(f"Error in agent session: {e}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}
    finally:
        if session:
            await session.close()

async def forward_bedrock_to_websocket(connection_id: str, session: S2sSessionManager, apigw_client):
    """Forward Bedrock responses to WebSocket client"""
    try:
        while session.is_active:
            response = await asyncio.wait_for(session.output_queue.get(), timeout=300)
            
            try:
                apigw_client.post_to_connection(
                    ConnectionId=connection_id,
                    Data=json.dumps(response).encode('utf-8')
                )
                
                # Check for session end
                if 'event' in response and 'sessionEnd' in response['event']:
                    print("Session ended by Bedrock")
                    break
                    
            except apigw_client.exceptions.GoneException:
                print(f"Connection {connection_id} gone")
                break
            except Exception as e:
                print(f"Error posting to connection: {e}")
                
    except asyncio.TimeoutError:
        print("Session timeout")
    except Exception as e:
        print(f"Error forwarding: {e}")

async def poll_client_messages(connection_id: str, session: S2sSessionManager):
    """Poll DynamoDB for new messages from client and forward to Bedrock"""
    last_message_time = 0
    
    try:
        while session.is_active:
            # Poll DynamoDB for new messages
            response = table.get_item(Key={'connectionId': connection_id})
            
            if 'Item' in response:
                item = response['Item']
                message_time = item.get('lastMessageTime', 0)
                
                if message_time > last_message_time:
                    last_message_time = message_time
                    message = json.loads(item.get('lastMessage', '{}'))
                    
                    if 'event' in message:
                        event_type = list(message['event'].keys())[0]
                        print(f"Forwarding to Bedrock: {event_type}")
                        
                        # Forward to Bedrock
                        await session.send_raw_event(message)
                        
                        # Check for session end
                        if event_type == 'sessionEnd':
                            print("Session end requested")
                            break
            
            # Poll every 100ms
            await asyncio.sleep(0.1)
            
    except Exception as e:
        print(f"Error polling messages: {e}")
