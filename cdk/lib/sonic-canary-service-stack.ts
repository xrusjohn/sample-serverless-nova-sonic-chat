import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr_assets from 'aws-cdk-lib/aws-ecr-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SonicCanaryServiceStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  cluster: ecs.ICluster;
  bedrockRegion?: string;
  canarySchedule?: string;
  audioBucket?: string;
  recordingsBucket?: string;
}

export class SonicCanaryServiceStack extends cdk.Stack {
  public readonly agentUrl: string;
  public readonly canaryFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: SonicCanaryServiceStackProps) {
    super(scope, id, props);

    const bedrockRegion = props.bedrockRegion || 'us-east-1';
    const canarySchedule = props.canarySchedule || 'rate(5 minutes)';

    const vpc = props.vpc;
    const cluster = props.cluster;

    const agentImage = new ecr_assets.DockerImageAsset(this, 'AgentImage', {
      directory: path.join(__dirname, '../../python-agent'),
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModelWithResponseStream'],
      resources: ['*'],
    }));

    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'cloudwatch:PutMetricData',
      ],
      resources: ['*'],
    }));

    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    executionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/ecs-cwagent`],
    }));

    const cwAgentConfig = new ssm.StringParameter(this, 'CWAgentConfig', {
      parameterName: 'ecs-cwagent',
      stringValue: JSON.stringify({
        traces: {
          traces_collected: {
            application_signals: {},
          },
        },
        logs: {
          metrics_collected: {
            application_signals: {},
          },
        },
      }),
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 2048,
      cpu: 1024,
      taskRole,
      executionRole,
    });

    taskDefinition.addVolume({
      name: 'opentelemetry-auto-instrumentation-python',
    });

    const initContainer = taskDefinition.addContainer('init', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/aws-observability/adot-autoinstrumentation-python:latest'),
      essential: false,
      command: ['cp', '-a', '/autoinstrumentation/.', '/otel-auto-instrumentation-python'],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'init',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    initContainer.addMountPoints({
      sourceVolume: 'opentelemetry-auto-instrumentation-python',
      containerPath: '/otel-auto-instrumentation-python',
      readOnly: false,
    });

    const cwAgentContainer = taskDefinition.addContainer('ecs-cwagent', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest'),
      essential: true,
      secrets: {
        CW_CONFIG_CONTENT: ecs.Secret.fromSsmParameter(cwAgentConfig),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ecs-cwagent',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
    });

    const agentContainer = taskDefinition.addContainer('AgentContainer', {
      image: ecs.ContainerImage.fromDockerImageAsset(agentImage),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'sonic-agent',
        logRetention: logs.RetentionDays.ONE_WEEK,
      }),
      environment: {
        BEDROCK_REGION: bedrockRegion,
        PYTHONPATH: '/otel-auto-instrumentation-python/opentelemetry/instrumentation/auto_instrumentation:/app:/otel-auto-instrumentation-python',
        OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
        OTEL_TRACES_SAMPLER: 'xray',
        OTEL_TRACES_SAMPLER_ARG: 'endpoint=http://localhost:2000',
        OTEL_LOGS_EXPORTER: 'none',
        OTEL_PYTHON_DISTRO: 'aws_distro',
        OTEL_PYTHON_CONFIGURATOR: 'aws_configurator',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://localhost:4316/v1/traces',
        OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT: 'http://localhost:4316/v1/metrics',
        OTEL_METRICS_EXPORTER: 'none',
        OTEL_AWS_APPLICATION_SIGNALS_ENABLED: 'true',
        OTEL_RESOURCE_ATTRIBUTES: 'service.name=sonic-agent',
        OTEL_PROPAGATORS: 'tracecontext,baggage,b3,xray',
      },
      portMappings: [{
        containerPort: 9000,
        protocol: ecs.Protocol.TCP,
      }],
    });

    agentContainer.addMountPoints({
      sourceVolume: 'opentelemetry-auto-instrumentation-python',
      containerPath: '/otel-auto-instrumentation-python',
      readOnly: false,
    });

    agentContainer.addContainerDependencies({
      container: initContainer,
      condition: ecs.ContainerDependencyCondition.SUCCESS,
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener('Listener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc,
      port: 9000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/health',
        protocol: elbv2.Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        timeout: cdk.Duration.seconds(10),
        interval: cdk.Duration.seconds(30),
        healthyHttpCodes: '200,426',
      },
      stickinessCookieDuration: cdk.Duration.hours(1),
    });

    listener.addTargetGroups('DefaultTarget', {
      targetGroups: [targetGroup],
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      minHealthyPercent: 0,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    });

    service.attachToApplicationTargetGroup(targetGroup);

    this.agentUrl = `ws://${alb.loadBalancerDnsName}`;

    const audioBucket = props.audioBucket 
      ? s3.Bucket.fromBucketName(this, 'AudioBucket', props.audioBucket)
      : new s3.Bucket(this, 'AudioBucket', {
          bucketName: `sonic-canary-audio-${this.account}-${this.region}`,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

    const recordingsBucket = props.recordingsBucket
      ? s3.Bucket.fromBucketName(this, 'RecordingsBucket', props.recordingsBucket)
      : new s3.Bucket(this, 'RecordingsBucket', {
          bucketName: `sonic-canary-recordings-${this.account}-${this.region}`,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
        });

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

    audioBucket.grantRead(this.canaryFunction);
    recordingsBucket.grantWrite(this.canaryFunction);
    
    this.canaryFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    const canaryRule = new events.Rule(this, 'CanaryRule', {
      schedule: events.Schedule.expression(canarySchedule),
    });
    canaryRule.addTarget(new targets.LambdaFunction(this.canaryFunction));

    new cdk.CfnOutput(this, 'AgentWebSocketUrl', {
      value: this.agentUrl,
    });

    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: alb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, 'CanaryFunctionName', {
      value: this.canaryFunction.functionName,
    });
  }
}
