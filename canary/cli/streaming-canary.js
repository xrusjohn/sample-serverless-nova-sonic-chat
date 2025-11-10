#!/usr/bin/env node

require('dotenv').config();

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { v4: uuidv4 } = require('uuid');

const lambda = new LambdaClient({ region: 'us-east-1' });

// Streaming stack function name
const STREAMING_FUNCTION_NAME = 'StreamingNovaSonicStack-StreamingAgentStreamingHan-lD7DHxB8I0m1';

async function runStreamingCanary() {
  const sessionId = uuidv4();
  console.log(`🎯 Starting streaming canary test: ${sessionId}`);

  try {
    // Test streaming agent directly
    const testPayload = {
      sessionId,
      action: 'start_streaming',
      systemPrompt: 'You are a helpful assistant. Respond briefly to audio input.',
      voiceId: 'Aria',
      continuousMode: true,
      audioFiles: ['test1.wav', 'test2.wav'],
      silencePadding: 1000
    };

    console.log('📤 Invoking streaming agent...');
    
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
