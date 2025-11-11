#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();

// Main stack with SonicCanary included
new CdkStack(app, 'ServerlessNovaSonicChatStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
  },
  bedrockRegion: 'us-east-1',
  // allowedEmailDomainList: ["example.com"],
});

// Aspects.of(app).add(new AwsSolutionsChecks());
