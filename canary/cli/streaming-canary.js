#!/usr/bin/env node

require('dotenv').config();

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = args[i + 1];
    options[key] = value;
    i++; // Skip next argument as it's the value
  }
}

// Override env with CLI args
if (options.file1) process.env.STREAMING_AUDIO_FILE1 = options.file1;
if (options.file2) process.env.STREAMING_AUDIO_FILE2 = options.file2;
if (options.duration) process.env.STREAMING_DURATION_SECONDS = options.duration;
if (options.voice) process.env.VOICE_ID = options.voice;
if (options.lambda) process.env.TEST_LAMBDA = 'true';

// Show help
if (options.help || options.h) {
  console.log(`
🎤 Streaming Nova Sonic Canary CLI

Usage: node streaming-canary.js [options]

Options:
  --file1 <file>     First audio file (default: good_morning_nova.wav)
  --file2 <file>     Second audio file (default: hi.wav)  
  --duration <sec>   Streaming duration in seconds (default: 8)
  --voice <voice>    Nova Sonic voice ID (default: Aria)
  --lambda           Test with Lambda instead of local agent
  --help, -h         Show this help

Environment variables:
  STREAMING_AUDIO_FILE1, STREAMING_AUDIO_FILE2, STREAMING_DURATION_SECONDS
  VOICE_ID, SYSTEM_PROMPT, TEST_LAMBDA

Examples:
  node streaming-canary.js --file1 turn1.wav --file2 turn2.wav --duration 10
  node streaming-canary.js --voice Ruth --lambda
  `);
  process.exit(0);
}

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
  // Get audio file paths from environment or use defaults
  const audioFile1 = process.env.STREAMING_AUDIO_FILE1 || 'turn1.raw';
  const audioFile2 = process.env.STREAMING_AUDIO_FILE2 || 'turn2.raw';
  const silenceFile = process.env.SILENCE_FILE || 'silence_1s.raw';
  
  const audioPath1 = path.join(__dirname, '../audio', audioFile1);
  const audioPath2 = path.join(__dirname, '../audio', audioFile2);
  const silencePath = path.join(__dirname, '../audio', silenceFile);
  
  console.log(`🔧 Audio file 1: ${audioFile1}`);
  console.log(`🔧 Audio file 2: ${audioFile2}`);
  console.log(`🔧 Silence file: ${silenceFile}`);
  
  const audioFiles = [];
  
  // Load first audio file
  if (fs.existsSync(audioPath1)) {
    let audioBuffer1 = fs.readFileSync(audioPath1);
    if (fs.existsSync(silencePath)) {
      const silenceBuffer = fs.readFileSync(silencePath);
      audioBuffer1 = Buffer.concat([audioBuffer1, silenceBuffer]);
    }
    audioFiles.push({
      name: audioFile1,
      data: arrayBufferToBase64(audioBuffer1)
    });
    console.log(`✓ Loaded ${audioFile1}: ${audioBuffer1.length} bytes`);
  } else {
    console.log(`⚠️  Audio file not found: ${audioPath1}`);
  }
  
  // Load second audio file  
  if (fs.existsSync(audioPath2)) {
    let audioBuffer2 = fs.readFileSync(audioPath2);
    if (fs.existsSync(silencePath)) {
      const silenceBuffer = fs.readFileSync(silencePath);
      audioBuffer2 = Buffer.concat([audioBuffer2, silenceBuffer]);
    }
    audioFiles.push({
      name: audioFile2,
      data: arrayBufferToBase64(audioBuffer2)
    });
    console.log(`✓ Loaded ${audioFile2}: ${audioBuffer2.length} bytes`);
  } else {
    console.log(`⚠️  Audio file not found: ${audioPath2}`);
  }
  
  return audioFiles;
}

const { runRealStreamingAgent } = require('./real-streaming-agent');

async function runStreamingCanary() {
  const sessionId = uuidv4();
  console.log(`🎯 Starting streaming canary test: ${sessionId}`);

  try {
    // Load real audio files
    const audioFiles = loadAudioFiles();
    console.log(`📁 Loaded ${audioFiles.length} audio files`);
    
    // Test with REAL Nova Sonic agent
    console.log('🚀 Testing with REAL Nova Sonic streaming agent...');
    const realResult = await runRealStreamingAgent(audioFiles);
    
    if (realResult.success) {
      console.log('✅ Real Nova Sonic streaming test PASSED');
      return true;
    } else {
      console.log('❌ Real Nova Sonic streaming test FAILED:', realResult);
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
