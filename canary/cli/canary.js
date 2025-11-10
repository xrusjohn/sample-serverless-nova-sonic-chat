#!/usr/bin/env node

require('dotenv').config();

const { events } = require('aws-amplify/data');
const { Amplify } = require('aws-amplify');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { publishMetrics, runTwoTurnCanary } = require('../shared/canary-core');

// WebSocket polyfill
const ws = require('ws');
Object.assign(global, { WebSocket: ws });
ws.setMaxListeners(100);

const NAMESPACE = process.env.EVENT_BUS_NAMESPACE || 'default';
const EVENT_API_ENDPOINT = process.env.EVENT_API_ENDPOINT;

// Configure Amplify for AppSync Events with IAM auth
Amplify.configure(
  {
    API: {
      Events: {
        endpoint: `${EVENT_API_ENDPOINT}/event`,
        region: process.env.AWS_REGION || 'us-east-1',
        defaultAuthMode: 'iam',
      },
    },
  },
  {
    Auth: {
      credentialsProvider: {
        getCredentialsAndIdentityId: async () => {
          const provider = fromNodeProviderChain();
          const credentials = await provider();
          return { credentials };
        },
        clearCredentialsAndIdentityId: async () => {},
      },
    },
  }
);

const arrayBufferToBase64 = (buffer) => {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return Buffer.from(binary.join(''), 'binary').toString('base64');
};

function loadAudioChunks(filePath) {
  const audioBuffer = fs.readFileSync(filePath);
  const silencePath = path.join(__dirname, '../audio/silence_1s.raw');
  
  // Add silence padding if silence file exists
  let combinedBuffer = audioBuffer;
  if (fs.existsSync(silencePath)) {
    const silenceBuffer = fs.readFileSync(silencePath);
    combinedBuffer = Buffer.concat([audioBuffer, silenceBuffer]);
  }
  
  const base64Audio = arrayBufferToBase64(combinedBuffer);
  const chunkSize = 4096;
  const chunks = [];
  for (let i = 0; i < base64Audio.length; i += chunkSize) {
    chunks.push(base64Audio.slice(i, i + chunkSize));
  }
  return chunks;
}

async function main() {
  const testId = uuidv4();
  const sessionId = uuidv4();
  const userId = 'canary-user';

  console.log(`\n🚀 Starting two-turn canary test: ${testId}`);
  console.log(`   Session: ${sessionId}`);
  console.log(`   User: ${userId}\n`);

  try {
    const audioFile1 = process.argv[2] || 'hi.raw';
    const audioFile2 = process.argv[3] || 'hi.raw';
    const audioPath1 = path.join(__dirname, '../audio', audioFile1);
    const audioPath2 = path.join(__dirname, '../audio', audioFile2);
    
    if (!fs.existsSync(audioPath1)) {
      throw new Error(`Test audio not found at ${audioPath1}`);
    }
    if (!fs.existsSync(audioPath2)) {
      throw new Error(`Test audio not found at ${audioPath2}`);
    }
    
    const audioChunks1 = loadAudioChunks(audioPath1);
    const audioChunks2 = loadAudioChunks(audioPath2);
    
    console.log(`✓ Loaded turn 1 audio: ${audioFile1} (${audioChunks1.length} chunks)`);
    console.log(`✓ Loaded turn 2 audio: ${audioFile2} (${audioChunks2.length} chunks)\n`);

    const agentFunctionName = process.env.AGENT_HANDLER_FUNCTION_NAME;
    if (!agentFunctionName) {
      throw new Error('AGENT_HANDLER_FUNCTION_NAME environment variable not set');
    }

    const result = await runTwoTurnCanary({
      events,
      audioChunks1,
      audioChunks2,
      testId,
      sessionId,
      userId,
      namespace: NAMESPACE,
      agentFunctionName
    });

    console.log(`\n✅ PASS`);
    console.log(`\n📊 Results:`);
    console.log(`   Total time: ${result.totalTime}ms`);
    console.log(`   Turn 1 time: ${result.turn1Time}ms`);
    console.log(`   Turn 2 time: ${result.turn2Time}ms`);
    console.log(`   Test ID: ${testId}`);

    // Publish metrics
    await publishMetrics('CanarySuccess', 1, testId);
    await publishMetrics('CanaryTotalTime', result.totalTime, testId);
    await publishMetrics('CanaryTurn1Time', result.turn1Time, testId);
    await publishMetrics('CanaryTurn2Time', result.turn2Time, testId);
    await publishMetrics('CanaryChannelConnectTime', result.channelConnectTime, testId);
    await publishMetrics('CanaryAgentInvokeTime', result.agentInvokeTime, testId);
    await publishMetrics('CanaryReadyWaitTime', result.readyWaitTime, testId);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ FAIL: ${error.message}`);
    await publishMetrics('CanarySuccess', 0, testId);
    await publishMetrics('CanaryFailure', 1, testId);
    process.exit(1);
  }
}

main();
