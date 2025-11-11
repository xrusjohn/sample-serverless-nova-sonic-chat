#!/usr/bin/env node

require('dotenv').config();

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const lambda = new LambdaClient({ region: 'us-east-1' });

// Streaming stack function name
const STREAMING_FUNCTION_NAME = 'StreamingNovaSonicStack-StreamingAgentStreamingHan-lD7DHxB8I0m1';

const arrayBufferToBase64 = (buffer) => {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return Buffer.from(binary.join(''), 'binary').toString('base64');
};

function loadAudioFiles() {
  // Load the same audio files as original canary
  const audioPath1 = path.join(__dirname, '../audio/hello_how_are_you.raw');
  const audioPath2 = path.join(__dirname, '../audio/what_is_the_weather_like.raw');
  const silencePath = path.join(__dirname, '../audio/silence_1s.raw');
  
  const audioFiles = [];
  
  // Load first audio file
  if (fs.existsSync(audioPath1)) {
    let audioBuffer1 = fs.readFileSync(audioPath1);
    if (fs.existsSync(silencePath)) {
      const silenceBuffer = fs.readFileSync(silencePath);
      audioBuffer1 = Buffer.concat([audioBuffer1, silenceBuffer]);
    }
    audioFiles.push({
      name: 'hello_how_are_you.raw',
      data: arrayBufferToBase64(audioBuffer1)
    });
  }
  
  // Load second audio file  
  if (fs.existsSync(audioPath2)) {
    let audioBuffer2 = fs.readFileSync(audioPath2);
    if (fs.existsSync(silencePath)) {
      const silenceBuffer = fs.readFileSync(silencePath);
      audioBuffer2 = Buffer.concat([audioBuffer2, silenceBuffer]);
    }
    audioFiles.push({
      name: 'what_is_the_weather_like.raw',
      data: arrayBufferToBase64(audioBuffer2)
    });
  }
  
  return audioFiles;
}

async function runStreamingCanary() {
  const sessionId = uuidv4();
  console.log(`🎯 Starting streaming canary test: ${sessionId}`);

  try {
    // Load real audio files
    const audioFiles = loadAudioFiles();
    console.log(`📁 Loaded ${audioFiles.length} audio files`);
    
    // Test streaming agent with real audio
    const testPayload = {
      sessionId,
      action: 'start_streaming',
      systemPrompt: 'You are a helpful assistant. Respond briefly to audio input.',
      voiceId: 'Aria',
      continuousMode: true,
      audioFiles: audioFiles,
      silencePadding: 1000
    };

    console.log('📤 Invoking streaming agent with real audio files...');
    
    const command = new InvokeCommand({
      FunctionName: STREAMING_FUNCTION_NAME,
      Payload: JSON.stringify(testPayload),
    });

    const response = await lambda.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    console.log('📨 Streaming agent response:', result);

    if (result.statusCode === 200) {
      console.log('✅ Streaming canary test PASSED');
      return true;
    } else {
      console.log('❌ Streaming canary test FAILED:', result);
      return false;
    }

  } catch (error) {
    console.error('❌ Streaming canary test ERROR:', error);
    return false;
  }
}

// Run the test
if (require.main === module) {
  runStreamingCanary()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runStreamingCanary };

// Run the test
if (require.main === module) {
  runStreamingCanary()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runStreamingCanary };
