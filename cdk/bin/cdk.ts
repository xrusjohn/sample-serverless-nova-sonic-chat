#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NovaSonicWebappStack } from '../lib/nova-sonic-webapp-stack';
import { NovaSonicCanaryStack } from '../lib/nova-sonic-canary-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();

const bedrockRegion = 'us-east-1';

// Main webapp stack (Node.js agent + UI + canary)
new NovaSonicWebappStack(app, 'NovaSonicWebappStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
  },
  bedrockRegion,
  // allowedEmailDomainList: ["example.com"],
});

// Canary stack (Python agent + canary Lambda for testing)
new NovaSonicCanaryStack(app, 'NovaSonicCanaryStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
  },
  bedrockRegion,
});

// Aspects.of(app).add(new AwsSolutionsChecks());
