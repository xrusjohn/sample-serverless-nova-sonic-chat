"""
Simplified session manager for Lambda WebSocket handler.
Adapted from AWS amazon-nova-samples.
"""
import asyncio
import json
import boto3
import os
from s2s_events import S2sEvent

class SessionManager:
    """Manages a single Nova Sonic streaming session"""
    
    def __init__(self, connection_id: str, apigw_client):
        self.connection_id = connection_id
        self.apigw_client = apigw_client
        self.bedrock = boto3.client('bedrock-runtime', region_name=os.environ['BEDROCK_REGION'])
        
        self.audio_queue = asyncio.Queue()
        self.is_active = False
        self.stream_task = None
        
        # Session state
        self.prompt_name = None
        self.content_name = None
    
    async def start_session(self, config: dict):
        """Start a new Bedrock streaming session"""
        self.is_active = True
        
        # Extract config
        system_prompt = config.get('systemPrompt', 'You are a helpful assistant.')
        voice_id = config.get('voiceId', 'matthew')
        
        # Start Bedrock stream
        self.stream_task = asyncio.create_task(self._bedrock_stream(system_prompt, voice_id))
        
        # Send ready event
        await self._send_to_client({'event': {'ready': {}}, 'timestamp': 0})
    
    async def add_audio(self, prompt_name: str, content_name: str, audio_b64: str):
        """Queue audio for processing"""
        await self.audio_queue.put({
            'prompt_name': prompt_name,
            'content_name': content_name,
            'audio': audio_b64
        })
    
    async def end_session(self):
        """End the session"""
        self.is_active = False
        if self.stream_task:
            self.stream_task.cancel()
            try:
                await self.stream_task
            except asyncio.CancelledError:
                pass
    
    async def _bedrock_stream(self, system_prompt: str, voice_id: str):
        """
        Main Bedrock streaming loop.
        TODO: Implement actual Bedrock invoke_model_with_response_stream
        """
        try:
            # This is a simplified placeholder
            # Full implementation would use:
            # response = self.bedrock.invoke_model_with_response_stream(
            #     modelId='amazon.nova-sonic-v1:0',
            #     body=json.dumps({...})
            # )
            
            # For now, just echo back that we received audio
            while self.is_active:
                audio_data = await self.audio_queue.get()
                
                # Send audioStop to indicate processing complete
                await self._send_to_client({
                    'event': {'audioStop': {}},
                    'timestamp': 0
                })
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error in Bedrock stream: {e}")
            await self._send_to_client({
                'event': {'error': {'message': str(e)}},
                'timestamp': 0
            })
    
    async def _send_to_client(self, data: dict):
        """Send data to WebSocket client"""
        try:
            self.apigw_client.post_to_connection(
                ConnectionId=self.connection_id,
                Data=json.dumps(data).encode('utf-8')
            )
        except self.apigw_client.exceptions.GoneException:
            print(f"Connection {self.connection_id} is gone")
            self.is_active = False
        except Exception as e:
            print(f"Error sending to client: {e}")
