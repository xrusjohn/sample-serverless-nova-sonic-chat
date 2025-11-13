import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CanaryDashboard } from './constructs/canary-dashboard';


interface SonicAgentPythonStackProps extends cdk.StackProps {
  readonly bedrockRegion?: string;
  readonly table?: dynamodb.ITable;
}

export class NovaSonicCanaryStack extends cdk.Stack {


  constructor(scope: Construct, id: string, props: SonicAgentPythonStackProps) {
    super(scope, id, props);

    const bedrockRegion = props.bedrockRegion || 'us-east-1';

    // Use existing table or create new one
    const table = props.table || new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });



    // Python Canary Lambda Function
    const canaryFunction = new lambda.Function(this, 'PythonCanaryFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'sonic_canary_lambda.handler',
      code: lambda.Code.fromAsset('../python-agent', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
          ],
        },
      }),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        AUDIO_BUCKET: 'sonic-canary-audio-441262788356-us-east-1',
        AUDIO_FILE1: 'turn1.wav',
        AUDIO_FILE2: 'turn2.wav',
        RECORDINGS_BUCKET: 'sonic-canary-transcripts-441262788356-us-east-1',
        VOICE_ID: 'matthew',
      },
    });

    // Grant canary permissions
    canaryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: ['arn:aws:s3:::sonic-canary-audio-441262788356-us-east-1/*'],
      })
    );

    canaryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        resources: ['arn:aws:s3:::sonic-canary-transcripts-441262788356-us-east-1/*'],
      })
    );

    canaryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Schedule canary every 5 minutes
    const canaryRule = new cdk.aws_events.Rule(this, 'PythonCanarySchedule', {
      schedule: cdk.aws_events.Schedule.rate(cdk.Duration.minutes(5)),
    });

    canaryRule.addTarget(new cdk.aws_events_targets.LambdaFunction(canaryFunction));



    new cdk.CfnOutput(this, 'PythonCanaryFunctionName', {
      value: canaryFunction.functionName,
      description: 'Python Canary Lambda Function Name',
    });

    // CloudWatch Dashboard for both Node.js and Python canaries
    new CanaryDashboard(this, 'CanaryDashboard');
  }
}
