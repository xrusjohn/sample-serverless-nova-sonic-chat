#!/usr/bin/env node

require('dotenv').config();

const { events } = require('aws-amplify/data');
const { Amplify } = require('aws-amplify');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

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

async function playConversation(recordingFile) {
  if (!fs.existsSync(recordingFile)) {
    console.error(`Recording file not found: ${recordingFile}`);
    process.exit(1);
  }

  const recording = JSON.parse(fs.readFileSync(recordingFile, 'utf8'));
  const sessionId = uuidv4();
  const userId = 'player-user';

  console.log(`\n▶️  Playing conversation: ${path.basename(recordingFile)}`);
  console.log(`   Session: ${sessionId}`);
  console.log(`   Events: ${recording.events.length}\n`);

  try {
    const channelPath = `/${NAMESPACE}/user/${userId}/${sessionId}`;
    const channel = await events.connect(channelPath);
    console.log(`✓ Connected to AppSync Events`);

    let eventIndex = 0;
    for (const event of recording.events) {
      if (event.direction === 'ctob') {
        await channel.publish({
          direction: 'ctob',
          event: event.event,
          data: event.data
        });
        console.log(`[${eventIndex}] Sent: ${event.event}`);
      }
      eventIndex++;
      
      // Small delay between events
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`\n✓ Playback complete`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ Playback failed: ${error.message}`);
    process.exit(1);
  }
}

const recordingFile = process.argv[2];
if (!recordingFile) {
  console.error('Usage: node player.js <recording.json>');
  process.exit(1);
}

playConversation(recordingFile);
