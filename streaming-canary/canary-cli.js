#!/usr/bin/env node

const { StreamingCore } = require('./streaming-core');
const { v4: uuidv4 } = require('uuid');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    file1: 'good_morning_nova.wav',
    file2: 'hi.wav', 
    duration: 4,
    voiceId: 'tiffany'
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (key === 'duration') config[key] = parseInt(value);
      else config[key] = value;
      i++;
    }
  }
  
  return config;
}

async function main() {
  const config = parseArgs();
  
  if (config.help || config.h) {
    console.log(`
🎤 Streaming Nova Sonic Canary CLI

Usage: node canary-cli.js [options]

Options:
  --file1 <file>     First audio file (default: good_morning_nova.wav)
  --file2 <file>     Second audio file (default: hi.wav)
  --duration <sec>   Duration in seconds (default: 4)
  --voiceId <voice>  Nova Sonic voice (default: tiffany)
  --help, -h         Show this help
    `);
    process.exit(0);
  }

  const sessionId = uuidv4();
  console.log(`🎯 Starting streaming canary: ${sessionId}`);
  
  try {
    const core = new StreamingCore();
    
    console.log(`📁 Loading audio files...`);
    const audioFiles = [];
    
    try {
      const audioFile1 = core.loadAudioFile(config.file1);
      audioFiles.push(audioFile1);
      console.log(`✓ Loaded ${config.file1} (${audioFile1.size} bytes)`);
    } catch (e) {
      console.error('❌ Error loading first audio file:', e.message);
      process.exit(1);
    }
    
    try {
      const audioFile2 = core.loadAudioFile(config.file2);
      audioFiles.push(audioFile2);
      console.log(`✓ Loaded ${config.file2} (${audioFile2.size} bytes)`);
    } catch (e) {
      console.log(`⚠️  Could not load second file: ${e.message}`);
    }
    
    console.log(`🚀 Starting bidirectional conversation...`);
    const result = await core.streamToAgent(sessionId, audioFiles, config);
    
    console.log('📨 Final result:', result);
    
    if (result && result.statusCode === 200) {
      console.log('✅ Streaming canary PASSED');
      process.exit(0);
    } else {
      console.log('❌ Streaming canary FAILED');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
