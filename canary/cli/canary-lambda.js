#!/usr/bin/env node

require('dotenv').config();
const { runTwoTurnCanary, publishMetrics } = require('./canary-core');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const path = require('path');

// WebSocket polyfill
const ws = require('ws');
Object.assign(global, { WebSocket: ws });
ws.setMaxListeners(100);

const lambda = new LambdaClient({});

async function invokeLambdaAgent(params) {
  const agentFunctionName = process.env.AGENT_HANDLER_FUNCTION_NAME;
  if (!agentFunctionName) {
    throw new Error('AGENT_HANDLER_FUNCTION_NAME environment variable not set');
  }

  const invokeCommand = new InvokeCommand({
    FunctionName: agentFunctionName,
    InvocationType: 'Event',
    Payload: JSON.stringify(params)
  });

  const response = await lambda.send(invokeCommand);
  if (response.StatusCode !== 202) {
    return { success: false, error: `Lambda invocation failed: ${response.StatusCode}` };
  }
  return { success: true };
}

async function main() {
  const audioFile1 = process.argv[2] || 'hi.raw';
  const audioFile2 = process.argv[3] || 'hi.raw';
  
  const result = await runTwoTurnCanary({
    invokeAgent: invokeLambdaAgent,
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
