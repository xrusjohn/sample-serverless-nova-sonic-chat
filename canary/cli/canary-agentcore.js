#!/usr/bin/env node

require('dotenv').config();
const { runTwoTurnCanary, publishMetrics } = require('./canary-core');
const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } = require('@aws-sdk/client-bedrock-agentcore');
const path = require('path');

// WebSocket polyfill
const ws = require('ws');
Object.assign(global, { WebSocket: ws });
ws.setMaxListeners(100);

const agentCore = new BedrockAgentCoreClient({});

async function invokeAgentCoreAgent(params) {
  const agentRuntimeArn = process.env.AGENT_CORE_RUNTIME_ARN;
  
  if (!agentRuntimeArn) {
    throw new Error('AGENT_CORE_RUNTIME_ARN environment variable not set');
  }

  try {
    const res = await agentCore.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn,
        runtimeSessionId: params.sessionId,
        payload: JSON.stringify(params),
        contentType: 'application/json',
      })
    );

    return { success: true };
  } catch (error) {
    console.error('Failed to invoke AgentCore:', error);
    return { success: false, error: error.message };
  }
}

async function main() {
  const audioFile1 = process.argv[2] || 'hi.raw';
  const audioFile2 = process.argv[3] || 'hi.raw';
  
  const result = await runTwoTurnCanary({
    invokeAgent: invokeAgentCoreAgent,
    eventApiEndpoint: process.env.EVENT_API_ENDPOINT,
    eventBusNamespace: process.env.EVENT_BUS_NAMESPACE || 'event-bus',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    audioFile1: path.join(__dirname, '../audio', audioFile1),
    audioFile2: path.join(__dirname, '../audio', audioFile2),
    recordingDir: path.join(__dirname, '../recordings')
  });

  console.log(`\n${result.success ? '✅ PASS' : '❌ FAIL'}`);
  if (result.success) {
    await publishMetrics('CanarySuccess', 1, result.testId);
  } else {
    await publishMetrics('CanarySuccess', 0, result.testId);
  }
  process.exit(result.success ? 0 : 1);
}

main().catch(async error => {
  console.error('Fatal error:', error);
  await publishMetrics('CanarySuccess', 0, 'unknown');
  process.exit(1);
});
