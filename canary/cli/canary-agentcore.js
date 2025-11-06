#!/usr/bin/env node

require('dotenv').config();
const { runTwoTurnCanary, publishMetrics } = require('./canary-core');
const { BedrockAgentRuntimeClient, InvokeAgentCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const path = require('path');

// WebSocket polyfill
const ws = require('ws');
Object.assign(global, { WebSocket: ws });
ws.setMaxListeners(100);

const bedrockAgentRuntime = new BedrockAgentRuntimeClient({});

async function invokeAgentCoreAgent(params) {
  const agentId = process.env.AGENTCORE_AGENT_ID;
  const agentAliasId = process.env.AGENTCORE_AGENT_ALIAS_ID || 'TSTALIASID';
  
  if (!agentId) {
    throw new Error('AGENTCORE_AGENT_ID environment variable not set');
  }

  // AgentCore invocation - this is a placeholder
  // You'll need to implement the actual AgentCore invocation based on your setup
  // This might involve calling a different API or using a different SDK
  
  console.log(`⚠️  AgentCore invocation not yet implemented`);
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   Alias ID: ${agentAliasId}`);
  
  // TODO: Implement AgentCore-specific invocation
  // For now, return success to allow testing the structure
  return { success: true };
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
