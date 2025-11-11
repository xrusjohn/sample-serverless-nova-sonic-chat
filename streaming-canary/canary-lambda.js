const { StreamingCore } = require('./streaming-core');
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
  const sessionId = uuidv4();
  console.log(`🎯 Streaming canary Lambda: ${sessionId}`);
  
  try {
    const core = new StreamingCore();
    
    // Load default audio files
    const audioFiles = [];
    
    try {
      const file1 = core.loadAudioFile('good_morning_nova.wav');
      const file2 = core.loadAudioFile('hi.wav');
      audioFiles.push(file1, file2);
      console.log(`✓ Loaded ${audioFiles.length} audio files`);
    } catch (error) {
      console.log(`⚠️  Audio loading error: ${error.message}`);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'Audio files not found' })
      };
    }
    
    // Stream to existing agent
    console.log(`🚀 Streaming to Nova Sonic agent...`);
    const result = await core.streamToAgent(sessionId, audioFiles, {
      duration: 4,
      voiceId: 'Aria'
    });
    
    console.log('📨 Agent response:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: result.statusCode === 200,
        sessionId,
        agentResponse: result
      })
    };
    
  } catch (error) {
    console.error('❌ Streaming canary Lambda error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
