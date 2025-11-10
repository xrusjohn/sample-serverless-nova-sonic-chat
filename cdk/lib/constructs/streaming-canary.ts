import { Duration } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { IFunction, Runtime, Code, Function as LF } from 'aws-cdk-lib/aws-lambda';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { join } from 'path';

export interface StreamingCanaryProps {
  serviceApiEndpoint: string;
  agentHandler: IFunction;
}

export class StreamingCanary extends Construct {
  constructor(scope: Construct, id: string, props: StreamingCanaryProps) {
    super(scope, id);

    const { serviceApiEndpoint, agentHandler } = props;

    const canaryFunction = new LF(this, 'StreamingCanaryFunction', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'streaming-canary.handler',
      code: Code.fromAsset(join('..', 'canary')),
      timeout: Duration.minutes(10),
      environment: {
        SERVICE_API_ENDPOINT: serviceApiEndpoint,
        AGENT_FUNCTION_NAME: agentHandler.functionName,
        STREAMING_MODE: 'true',
      },
    });

    canaryFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [agentHandler.functionArn],
      })
    );

    new Rule(this, 'StreamingCanarySchedule', {
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [new LambdaFunction(canaryFunction)],
    });
  }
}
