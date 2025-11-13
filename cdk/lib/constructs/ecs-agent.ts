import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EcsAgentProps {
  readonly bedrockRegion: string;
}

export class EcsAgent extends Construct {
  public readonly serviceUrl: string;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsAgentProps) {
    super(scope, id);

    // VPC - use default or create new
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc', { isDefault: true });

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'SonicAgentCluster',
    });

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
    });

    // Grant Bedrock permissions to task role
    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${props.bedrockRegion}::foundation-model/*`],
      })
    );

    // Container
    const container = taskDefinition.addContainer('AgentContainer', {
      image: ecs.ContainerImage.fromAsset('../python-agent'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'sonic-agent',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        BEDROCK_REGION: props.bedrockRegion,
        PORT: '9000',
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:9000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      },
    });

    container.addPortMappings({
      containerPort: 9000,
      protocol: ecs.Protocol.TCP,
    });

    // Fargate Service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: {
        rollback: true,
      },
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // Target Group with sticky sessions for WebSocket
    const targetGroup = listener.addTargets('ECS', {
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/health',
        port: 'traffic-port',
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
      },
      stickinessCookieDuration: cdk.Duration.hours(1),
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // Enable sticky sessions
    targetGroup.setAttribute('stickiness.enabled', 'true');
    targetGroup.setAttribute('stickiness.type', 'lb_cookie');

    // Set ALB idle timeout for WebSocket connections
    alb.setAttribute('idle_timeout.timeout_seconds', '3600');

    // WebSocket URL (ws:// not wss:// since ALB is HTTP)
    this.serviceUrl = `ws://${alb.loadBalancerDnsName}`;

    new cdk.CfnOutput(this, 'EcsWebSocketUrl', {
      value: this.serviceUrl,
      description: 'ECS Fargate WebSocket URL',
    });

    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
    });
  }
}
