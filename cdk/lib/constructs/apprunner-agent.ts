import * as cdk from 'aws-cdk-lib';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import { Construct } from 'constructs';

export interface AppRunnerAgentProps {
  readonly bedrockRegion: string;
}

export class AppRunnerAgent extends Construct {
  public readonly serviceUrl: string;
  public readonly service: apprunner.CfnService;

  constructor(scope: Construct, id: string, props: AppRunnerAgentProps) {
    super(scope, id);

    // Build and push Docker image to ECR
    const imageAsset = new ecr_assets.DockerImageAsset(this, 'ImageAsset', {
      directory: '../python-agent',
    });

    // IAM role for App Runner instance
    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });

    // Grant Bedrock permissions
    instanceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${props.bedrockRegion}::foundation-model/*`],
      })
    );

    // IAM role for App Runner to access ECR
    const accessRole = new iam.Role(this, 'AccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
    });

    imageAsset.repository.grantPull(accessRole);

    // App Runner Service
    this.service = new apprunner.CfnService(this, 'Service', {
      serviceName: 'SonicAgentAppRunner',
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: imageAsset.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '9000',
            runtimeEnvironmentVariables: [
              {
                name: 'BEDROCK_REGION',
                value: props.bedrockRegion,
              },
              {
                name: 'PORT',
                value: '9000',
              },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: '1 vCPU',
        memory: '2 GB',
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'TCP',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      autoScalingConfigurationArn: undefined, // Use default auto-scaling
    });

    // App Runner provides HTTPS by default, convert to WSS
    this.serviceUrl = cdk.Fn.join('', [
      'wss://',
      cdk.Fn.select(0, cdk.Fn.split('://', this.service.attrServiceUrl)),
    ]);

    new cdk.CfnOutput(this, 'AppRunnerWebSocketUrl', {
      value: this.serviceUrl,
      description: 'App Runner WebSocket URL (WSS)',
    });

    new cdk.CfnOutput(this, 'AppRunnerServiceUrl', {
      value: this.service.attrServiceUrl,
      description: 'App Runner Service URL (HTTPS)',
    });
  }
}
