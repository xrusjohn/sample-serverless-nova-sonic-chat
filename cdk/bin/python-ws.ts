#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SonicAgentPythonStack } from '../lib/python-websocket-stack';

const app = new cdk.App();

new SonicAgentPythonStack(app, 'SonicAgentPythonStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
  },
  bedrockRegion: 'us-east-1',
});
