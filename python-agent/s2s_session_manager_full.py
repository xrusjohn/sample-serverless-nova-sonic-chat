"""
Full S2sSessionManager from AWS sample.
This uses custom SDK: aws-sdk-bedrock-runtime and smithy-aws-core

To use this, you need to install:
pip install aws-sdk-bedrock-runtime smithy-aws-core
"""
import asyncio
import json
import time
from s2s_events import S2sEvent

# These imports require custom SDK from AWS sample
try:
    from aws_sdk_bedrock_runtime.client import BedrockRuntimeClient, InvokeModelWithBidirectionalStreamOperationInput
    from aws_sdk_bedrock_runtime.models import InvokeModelWithBidirectionalStreamInputChunk, BidirectionalInputPayloadPart
    from aws_sdk_bedrock_runtime.config import Config
    HAS_CUSTOM_SDK = True
except ImportError:
    HAS_CUSTOM_SDK = False
    print("WARNING: Custom Bedrock SDK not installed. Install aws-sdk-bedrock-runtime and smithy-aws-core")

class S2sSessionManager:
    """Manages bidirectional streaming with AWS Bedrock using asyncio"""
    
    def __init__(self, region, model_id='amazon.nova-sonic-v1:0'):
        """Initialize the stream manager."""
        self.model_id = model_id
        self.region = region
        
        # Audio and output queues
        self.audio_input_queue = asyncio.Queue()
        self.output_queue = asyncio.Queue()
        
        self.response_task = None
        self.stream = None
        self.is_active = False
        self.bedrock_client = None
        
        # Session information
        self.prompt_name = None
        self.content_name = None
        self.audio_content_name = None

    def _initialize_client(self):
        """Initialize the Bedrock client."""
        if not HAS_CUSTOM_SDK:
            raise ImportError("Custom Bedrock SDK not installed")
        
        from smithy_aws_core.identity.environment import EnvironmentCredentialsResolver
        
        config = Config(
            endpoint_uri=f"https://bedrock-runtime.{self.region}.amazonaws.com",
            region=self.region,
            aws_credentials_identity_resolver=EnvironmentCredentialsResolver(),
        )
        self.bedrock_client = BedrockRuntimeClient(config=config)

    async def initialize_stream(self):
        """Initialize the bidirectional stream with Bedrock."""
        print("[SESSION] Initializing client...")
        if not self.bedrock_client:
            self._initialize_client()
        print("[SESSION] Client initialized")

        # Initialize the stream
        print("[SESSION] Opening bidirectional stream...")
        self.stream = await self.bedrock_client.invoke_model_with_bidirectional_stream(
            InvokeModelWithBidirectionalStreamOperationInput(model_id=self.model_id)
        )
        print("[SESSION] Stream opened")
        self.is_active = True
        
        # Start listening for responses
        print("[SESSION] Starting response processor...")
        self.response_task = asyncio.create_task(self._process_responses())
        
        # Start processing audio input
        print("[SESSION] Starting audio input processor...")
        asyncio.create_task(self._process_audio_input())
        
        await asyncio.sleep(0.1)
        print("[SESSION] Initialization complete")
        return self
    
    async def send_raw_event(self, event_data):
        """Send a raw event to the Bedrock stream."""
        if not self.stream or not self.is_active:
            return
        
        event_json = json.dumps(event_data)
        event = InvokeModelWithBidirectionalStreamInputChunk(
            value=BidirectionalInputPayloadPart(bytes_=event_json.encode('utf-8'))
        )
        await self.stream.input_stream.send(event)

        if "sessionEnd" in event_data["event"]:
            await self.close()
    
    async def _process_audio_input(self):
        """Process audio input from the queue and send to Bedrock."""
        while self.is_active:
            try:
                data = await self.audio_input_queue.get()
                
                prompt_name = data.get('prompt_name')
                content_name = data.get('content_name')
                audio_bytes = data.get('audio_bytes')
                
                if not audio_bytes or not prompt_name or not content_name:
                    continue

                audio_event = S2sEvent.audio_input(
                    prompt_name, 
                    content_name, 
                    audio_bytes.decode('utf-8') if isinstance(audio_bytes, bytes) else audio_bytes
                )
                
                await self.send_raw_event(audio_event)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error processing audio: {e}")
    
    def add_audio_chunk(self, prompt_name, content_name, audio_data):
        """Add an audio chunk to the queue."""
        self.audio_input_queue.put_nowait({
            'prompt_name': prompt_name,
            'content_name': content_name,
            'audio_bytes': audio_data
        })
    
    async def _process_responses(self):
        """Process incoming responses from Bedrock."""
        while self.is_active:
            try:            
                output = await self.stream.await_output()
                result = await output[1].receive()
                
                if result.value and result.value.bytes_:
                    response_data = result.value.bytes_.decode('utf-8')
                    json_data = json.loads(response_data)
                    json_data["timestamp"] = int(time.time() * 1000)
                    
                    # Put the response in the output queue
                    await self.output_queue.put(json_data)

            except json.JSONDecodeError as ex:
                print(f"JSON decode error: {ex}")
            except StopAsyncIteration:
                print("[SESSION] Bedrock stream ended")
                break
            except Exception as e:
                # Suppress expected cleanup errors
                if "CANCELLED" not in str(e) and "InvalidStateError" not in str(e):
                    print(f"Error receiving response: {e}")
                break

        self.is_active = False
        await self.close()
    
    async def close(self):
        """Close the stream properly."""
        if not self.is_active:
            return
            
        self.is_active = False
        
        # Clear queues
        while not self.audio_input_queue.empty():
            try:
                self.audio_input_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        while not self.output_queue.empty():
            try:
                self.output_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        
        if self.stream:
            try:
                await self.stream.input_stream.close()
                print("[SESSION] Bedrock stream closed gracefully")
            except Exception as e:
                # AWS CRT cleanup errors during shutdown are expected
                if "CANCELLED" in str(e) or "InvalidStateError" in str(e):
                    print("[SESSION] Bedrock connection closed (cleanup complete)")
                else:
                    print(f"[SESSION] Warning during stream close: {e}")
        
        if self.response_task and not self.response_task.done():
            self.response_task.cancel()
            try:
                await self.response_task
            except asyncio.CancelledError:
                pass
        
        self.stream = None
        self.response_task = None
