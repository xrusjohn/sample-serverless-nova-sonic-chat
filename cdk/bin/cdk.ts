#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkStack } from '../lib/cdk-stack';
import { StreamingNovaSonicStack } from '../lib/streaming-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Aspects } from 'aws-cdk-lib';

const app = new cdk.App();

// Original stack
new CdkStack(app, 'ServerlessNovaSonicChatStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
  },
  bedrockRegion: 'us-east-1',
  // allowedEmailDomainList: ["example.com"],
});

// New streaming stack
new StreamingNovaSonicStack(app, 'StreamingNovaSonicStack', {
  env: {
    region: process.env.CDK_DEFAULT_REGION,
  },
  bedrockRegion: 'us-east-1',
});

// Aspects.of(app).add(new AwsSolutionsChecks());
