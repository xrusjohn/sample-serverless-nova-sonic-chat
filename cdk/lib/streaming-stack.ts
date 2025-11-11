import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StreamingCanary } from './constructs/streaming-canary';

interface SonicCanaryStackProps extends cdk.StackProps {
  readonly serviceApiEndpoint: string;
  readonly agentFunctionName: string;
}

export class SonicCanaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SonicCanaryStackProps) {
    super(scope, id, props);

    // Import the existing agent function by name
    const agentHandler = cdk.aws_lambda.Function.fromFunctionName(
      this, 
      'ImportedAgentHandler', 
      props.agentFunctionName
    );

    new StreamingCanary(this, 'SonicCanary', {
      serviceApiEndpoint: props.serviceApiEndpoint,
      agentHandler: agentHandler,
    });
  }
}
