import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ContinuousAudioStream } from './agent/continuous-audio-stream';
import { NovaStream } from './agent/nova-stream';

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
      
      if (audioFiles && audioFiles.length > 0) {
        // Use provided audio files
        console.log(`📁 Processing ${audioFiles.length} provided audio files`);
        const testAudioPaths = [];
        
        for (let i = 0; i < audioFiles.length; i++) {
          const audioFile = audioFiles[i];
          const filePath = `/tmp/streaming-audio-${i}.raw`;
          
          // Decode base64 audio data and write to file
          const audioBuffer = Buffer.from(audioFile.data, 'base64');
          require('fs').writeFileSync(filePath, audioBuffer);
          testAudioPaths.push(filePath);
          
          console.log(`📄 Saved audio file: ${audioFile.name} (${audioBuffer.length} bytes)`);
        }
        
        // Load audio files into continuous stream
        continuousStream.loadAudioFiles(testAudioPaths);
      } else {
        // Generate test audio files (fallback)
        console.log('🎵 Generating test audio files...');
        const testAudioPaths = ['/tmp/test-audio-1.raw', '/tmp/test-audio-2.raw'];
        
        const fs = require('fs');
        const sampleRate = 16000;
        const audioDuration = 2; // seconds
        const samples = sampleRate * audioDuration;
        
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
      }
      
      // Start continuous streaming
      console.log('🎤 Starting continuous audio streaming...');
      continuousStream.startContinuousStream(1000); // 1 second silence padding
      
      // Let it stream for a few seconds
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Stop streaming
      continuousStream.stopStream();
      novaStream.terminate();
      
      // Publish metrics
      const sessionDuration = Date.now() - startTime;
      console.log(`✓ Streaming session duration: ${sessionDuration}ms`);
      console.log(`✓ Audio files processed: ${audioFiles?.length || 2}`);
      
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
          duration: sessionDuration,
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
    
    const errorDuration = Date.now() - startTime;
    console.log(`✓ Error duration: ${errorDuration}ms`);
    
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
