import { Duration, Stack } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function, Runtime, IFunction } from 'aws-cdk-lib/aws-lambda';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { EventBus } from './event-bus';

export interface CanaryProps {
  eventBus: EventBus;
  serviceApiEndpoint: string;
  bedrockRegion: string;
  agentHandler: IFunction;
  tableName: string;
}

export class Canary extends Construct {
  constructor(scope: Construct, id: string, props: CanaryProps) {
    super(scope, id);

    const { eventBus, serviceApiEndpoint, bedrockRegion, agentHandler, tableName } = props;

    // S3 bucket for test audio files and transcripts
    const audioBucket = new Bucket(this, 'AudioBucket', {
      bucketName: `sonic-canary-audio-${Stack.of(this).account}-${Stack.of(this).region}`,
    });

    // S3 bucket for storing conversation transcripts
    const transcriptBucket = new Bucket(this, 'TranscriptBucket', {
      bucketName: `sonic-canary-transcripts-${Stack.of(this).account}-${Stack.of(this).region}`,
    });

    // Deploy test audio files
    new BucketDeployment(this, 'AudioDeployment', {
      sources: [Source.asset('../canary/audio')],
      destinationBucket: audioBucket,
    });

    // Canary Lambda function
    const canaryFunction = new Function(this, 'CanaryFunction', {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: 'index.handler',
      code: Code.fromAsset('../canary/lambda'),
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: {
        AUDIO_BUCKET: audioBucket.bucketName,
        TRANSCRIPT_BUCKET: transcriptBucket.bucketName,
        EVENT_API_ENDPOINT: eventBus.httpEndpoint,
        EVENT_BUS_NAMESPACE: eventBus.defaultChannelName,
        SERVICE_API_ENDPOINT: serviceApiEndpoint,
        BEDROCK_REGION: bedrockRegion,
        AGENT_HANDLER_FUNCTION_NAME: agentHandler.functionName,
        TABLE_NAME: tableName,
        TURN1_AUDIO_FILE: 'hi.wav',
        TURN2_AUDIO_FILE: 'good_morning_nova.wav',
      },
    });

    // Permissions
    audioBucket.grantRead(canaryFunction);
    transcriptBucket.grantWrite(canaryFunction);
    eventBus.api.grantConnect(canaryFunction);
    eventBus.api.grantPublishAndSubscribe(canaryFunction);
    
    // Grant DynamoDB permissions
    canaryFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [`arn:aws:dynamodb:${Stack.of(this).region}:${Stack.of(this).account}:table/${tableName}`],
      })
    );

    canaryFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Grant permission to invoke the agent handler
    agentHandler.grantInvoke(canaryFunction);

    // EventBridge rule to trigger canary every 5 minutes
    new Rule(this, 'CanarySchedule', {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(canaryFunction)],
    });

    // CloudWatch Dashboard moved to streaming stack
  }
}