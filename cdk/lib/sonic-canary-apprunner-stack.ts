import * as cdk from 'aws-cdk-lib';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SonicCanaryAppRunnerStackProps extends cdk.StackProps {
  bedrockRegion?: string;
  canarySchedule?: string;
  audioBucket?: string;
  recordingsBucket?: string;
}

export class SonicCanaryAppRunnerStack extends cdk.Stack {
  public readonly agentUrl: string;
  public readonly canaryFunction: lambda.Function;

  constructor(scope: Construct, id: string, props?: SonicCanaryAppRunnerStackProps) {
    super(scope, id, props);

    const bedrockRegion = props?.bedrockRegion || 'us-east-1';
    const canarySchedule = props?.canarySchedule || 'rate(5 minutes)';

    // Build Docker image from python-agent directory
    const agentImage = new ecr_assets.DockerImageAsset(this, 'AgentImage', {
      directory: path.join(__dirname, '../../python-agent'),
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    // IAM role for App Runner with Bedrock permissions
    const appRunnerRole = new iam.Role(this, 'AppRunnerRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });

    appRunnerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));

    // App Runner service for WebSocket agent
    const appRunnerService = new apprunner.CfnService(this, 'AgentService', {
      serviceName: 'sonic-canary-agent',
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: new iam.Role(this, 'AppRunnerAccessRole', {
            assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
            managedPolicies: [
              iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppRunnerServicePolicyForECRAccess'),
            ],
          }).roleArn,
        },
        imageRepository: {
          imageIdentifier: agentImage.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '9000',
            runtimeEnvironmentVariables: [
              { name: 'BEDROCK_REGION', value: bedrockRegion },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: '1 vCPU',
        memory: '2 GB',
        instanceRoleArn: appRunnerRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'TCP',
        path: '/',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      autoScalingConfigurationArn: new apprunner.CfnAutoScalingConfiguration(this, 'AutoScaling', {
        autoScalingConfigurationName: 'sonic-canary-autoscaling',
        maxConcurrency: 100,
        maxSize: 10,
        minSize: 1,
      }).attrAutoScalingConfigurationArn,
    });

    // App Runner URL (attrServiceUrl is just the domain, no protocol)
    this.agentUrl = `wss://${appRunnerService.attrServiceUrl}`;

    // S3 buckets for canary (reuse existing or create new)
    const audioBucket = props?.audioBucket 
      ? s3.Bucket.fromBucketName(this, 'AudioBucket', props.audioBucket)
      : new s3.Bucket(this, 'AudioBucket', {
          bucketName: `sonic-canary-audio-${this.account}-${this.region}`,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

    const recordingsBucket = props?.recordingsBucket
      ? s3.Bucket.fromBucketName(this, 'RecordingsBucket', props.recordingsBucket)
      : new s3.Bucket(this, 'RecordingsBucket', {
          bucketName: `sonic-canary-recordings-${this.account}-${this.region}`,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

    // Lambda canary function
    this.canaryFunction = new lambda.Function(this, 'CanaryFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'sonic_canary_lambda.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../python-agent')),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        WS_URL: this.agentUrl,
        AUDIO_BUCKET: audioBucket.bucketName,
        AUDIO_FILE1: 'turn1.wav',
        AUDIO_FILE2: 'turn2.wav',
        RECORDINGS_BUCKET: recordingsBucket.bucketName,
        VOICE_ID: 'matthew',
      },
    });

    // Grant permissions
    audioBucket.grantRead(this.canaryFunction);
    recordingsBucket.grantWrite(this.canaryFunction);
    
    this.canaryFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    // EventBridge rule to trigger canary
    const canaryRule = new events.Rule(this, 'CanaryRule', {
      schedule: events.Schedule.expression(canarySchedule),
    });
    canaryRule.addTarget(new targets.LambdaFunction(this.canaryFunction));

    // Outputs
    new cdk.CfnOutput(this, 'AgentWebSocketUrl', {
      value: this.agentUrl,
      description: 'WebSocket URL for Python Sonic agent',
    });

    new cdk.CfnOutput(this, 'CanaryFunctionName', {
      value: this.canaryFunction.functionName,
      description: 'Lambda function name for canary',
    });

    new cdk.CfnOutput(this, 'AudioBucketName', {
      value: audioBucket.bucketName,
      description: 'S3 bucket for canary audio files',
    });

    new cdk.CfnOutput(this, 'RecordingsBucketName', {
      value: recordingsBucket.bucketName,
      description: 'S3 bucket for canary recordings',
    });
  }
}
