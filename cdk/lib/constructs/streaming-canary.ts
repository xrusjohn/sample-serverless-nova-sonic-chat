import { Duration } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { IFunction, Runtime, Code, Function as LF } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { join } from 'path';
import { EventBus } from './event-bus';

export interface StreamingCanaryProps {
  serviceApiEndpoint: string;
  agentHandler: IFunction;
  eventBus?: EventBus;
}

export class SonicCanary extends Construct {
  constructor(scope: Construct, id: string, props: StreamingCanaryProps) {
    super(scope, id);

    const { serviceApiEndpoint, agentHandler, eventBus } = props;

    const canaryFunction = new LF(this, 'StreamingCanaryFunction', {
      functionName: 'SonicCanary',
      runtime: Runtime.NODEJS_20_X,
      handler: 'lambda-handler.handler',
      code: Code.fromAsset(join('..', 'streaming-canary')),
      timeout: Duration.minutes(10),
      memorySize: 512,
      environment: {
        SERVICE_API_ENDPOINT: serviceApiEndpoint,
        AGENT_FUNCTION_NAME: agentHandler.functionName,
        STREAMING_AUDIO_FILE1: 'good_morning_nova.wav',
        STREAMING_AUDIO_FILE2: 'good_morning_nova.wav',
        VOICE_ID: 'tiffany',
        TURN_DELAY_MS: '2000',
        AUDIO_BUCKET: 'sonic-canary-audio-441262788356-us-east-1',
        TRANSCRIPT_BUCKET: 'sonic-canary-transcripts-441262788356-us-east-1',
        EVENT_API_ENDPOINT: eventBus?.httpEndpoint || 'https://6okdb2chbnetdmam3rgmbvmh6m.appsync-api.us-east-1.amazonaws.com',
        EVENT_BUS_NAMESPACE: eventBus?.defaultChannelName || 'event-bus',
      },
    });

    canaryFunction.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'lambda:InvokeFunction',
          'cloudwatch:PutMetricData',
          's3:PutObject',
          's3:GetObject',
        ],
        resources: ['*'],
      })
    );

    // Grant EventBus permissions if available
    if (eventBus) {
      eventBus.api.grantConnect(canaryFunction);
      eventBus.api.grantPublishAndSubscribe(canaryFunction);
    }

    canaryFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [agentHandler.functionArn],
      })
    );

    new Rule(this, 'StreamingCanarySchedule', {
      ruleName: 'SonicCanary-Schedule',
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(canaryFunction)],
    });
  }
}
