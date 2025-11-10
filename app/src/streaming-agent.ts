import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ContinuousAudioStream } from './agent/continuous-audio-stream';
import { NovaStream } from './agent/nova-stream';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({});

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('🎯 Streaming agent invoked:', JSON.stringify(event, null, 2));
  const startTime = Date.now();

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || event;
    const { sessionId, action, systemPrompt, voiceId, continuousMode, audioFiles } = body;

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

      // Open the Nova stream
      console.log('📡 Opening Nova Sonic stream...');
      await novaStream.open([]);

      // Create continuous audio stream
      const continuousStream = new ContinuousAudioStream(novaStream);
      
      // Generate test audio files (simulate continuous microphone)
      const testAudioPaths = [
        '/tmp/test-audio-1.raw',
        '/tmp/test-audio-2.raw'
      ];
      
      // Create test audio files (16kHz, 16-bit, mono, 2 seconds each)
      const fs = require('fs');
      const sampleRate = 16000;
      const duration = 2; // seconds
      const samples = sampleRate * duration;
      
      for (let i = 0; i < testAudioPaths.length; i++) {
        const audioBuffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
        // Generate simple tone for testing
        for (let j = 0; j < samples; j++) {
          const value = Math.sin(2 * Math.PI * (440 + i * 100) * j / sampleRate) * 16000;
          audioBuffer.writeInt16LE(Math.round(value), j * 2);
        }
        fs.writeFileSync(testAudioPaths[i], audioBuffer);
      }
      
      // Load audio files into continuous stream
      continuousStream.loadAudioFiles(testAudioPaths);
      
      // Start continuous streaming
      console.log('🎤 Starting continuous audio streaming...');
      continuousStream.startContinuousStream(1000); // 1 second silence padding
      
      // Let it stream for a few seconds
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Stop streaming
      continuousStream.stopStream();
      novaStream.terminate();
      
      // Publish metrics
      const duration = Date.now() - startTime;
      await publishMetrics('StreamingSessionDuration', duration, sessionId);
      await publishMetrics('StreamingSessionSuccess', 1, sessionId);
      
      console.log('✅ Streaming session completed');
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          sessionId,
          message: 'Streaming session completed',
          streamingMode: true,
          duration,
          audioFilesProcessed: audioFiles?.length || 2,
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
    
    const duration = Date.now() - startTime;
    await publishMetrics('StreamingSessionDuration', duration, 'error');
    await publishMetrics('StreamingSessionError', 1, 'error');
    
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

async function publishMetrics(metricName: string, value: number, sessionId: string) {
  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'StreamingSonicCanary',
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: metricName.includes('Duration') ? 'Milliseconds' : 'Count',
          Dimensions: [{ Name: 'SessionId', Value: sessionId }],
          Timestamp: new Date()
        }
      ]
    }));
    console.log(`✓ Published ${metricName}=${value}`);
  } catch (error) {
    console.error(`Failed to publish metric ${metricName}:`, error);
  }
}
