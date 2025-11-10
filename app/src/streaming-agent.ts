import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ContinuousAudioStream } from './agent/continuous-audio-stream';
import { NovaStream } from './agent/nova-stream';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('🎯 Streaming agent invoked:', JSON.stringify(event, null, 2));

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || event;
    const { sessionId, action, systemPrompt, voiceId, continuousMode } = body;

    if (action === 'start_streaming') {
      console.log('🎵 Starting continuous streaming session:', sessionId);
      
      // Create Nova stream
      const novaStream = new NovaStream(
        sessionId,
        voiceId || 'Aria',
        systemPrompt || 'You are a helpful assistant.',
        [], // tools
        []  // mcp tools
      );

      // Create continuous audio stream
      const continuousStream = new ContinuousAudioStream(novaStream);
      
      // Load test audio files (would be real files in production)
      // continuousStream.loadAudioFiles(['path/to/audio1.wav', 'path/to/audio2.wav']);
      
      // Start streaming
      // continuousStream.startContinuousStream(1000);
      
      console.log('✅ Streaming session initialized');
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          sessionId,
          message: 'Streaming session started',
          streamingMode: true,
        }),
      };
    }

    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: 'Unknown action',
      }),
    };

  } catch (error) {
    console.error('❌ Streaming agent error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
