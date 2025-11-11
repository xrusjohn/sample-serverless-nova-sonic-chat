const { StreamingCore } = require('./streaming-core');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  const sessionId = uuidv4();
  console.log(`🎯 Starting streaming canary Lambda: ${sessionId}`);
  
  try {
    const core = new StreamingCore();
    
    // Use default audio files (can be overridden via environment variables)
    const file1 = process.env.STREAMING_AUDIO_FILE1 || 'good_morning_nova.wav';
    const file2 = process.env.STREAMING_AUDIO_FILE2 || 'good_morning_nova.wav';
    
    console.log(`📁 Loading audio files: ${file1}, ${file2}`);
    const audioLoadStart = Date.now();
    const audioFiles = [];
    
    try {
      const audioFile1 = await core.loadAudioFile(file1);
      audioFiles.push(audioFile1);
      console.log(`✓ Loaded ${file1} (${audioFile1.length} chunks)`);
    } catch (e) {
      console.error('❌ Error loading first audio file:', e.message);
      throw e;
    }
    
    try {
      const audioFile2 = await core.loadAudioFile(file2);
      audioFiles.push(audioFile2);
      console.log(`✓ Loaded ${file2} (${audioFile2.length} chunks)`);
    } catch (e) {
      console.error('❌ Error loading second audio file:', e.message);
      throw e;
    }
    
    const audioLoadTime = Date.now() - audioLoadStart;
    console.log(`✓ Audio files loaded in ${audioLoadTime}ms`);
    
    console.log(`🚀 Starting bidirectional conversation...`);
    const result = await core.streamToAgent(sessionId, audioFiles, {
      voiceId: process.env.VOICE_ID || 'tiffany',
      systemPrompt: process.env.SYSTEM_PROMPT || 'You are a helpful assistant. Please respond briefly.',
      audioLoadTime
    });
    
    console.log('📨 Final result:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        sessionId, 
        success: true, 
        ...result 
      })
    };
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Publish failure metrics
    try {
      const core = new StreamingCore();
      await core.publishMetrics('StreamingCanarySuccess', 0, sessionId);
      await core.publishMetrics('StreamingCanaryFailure', 1, sessionId);
    } catch (metricsError) {
      console.error('❌ Error publishing failure metrics:', metricsError.message);
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        sessionId, 
        success: false, 
        error: error.message 
      })
    };
  }
};
