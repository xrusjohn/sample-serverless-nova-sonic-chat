import { CfnOutput, Duration, Size } from 'aws-cdk-lib';
import { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { DockerImageFunction, DockerImageCode, Architecture, IFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EventBus } from './event-bus';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface StreamingAgentProps {
  table: ITableV2;
  eventBus: EventBus;
  bedrockRegion: string;
}

export class StreamingAgent extends Construct {
  public handler: IFunction;
  constructor(scope: Construct, id: string, props: StreamingAgentProps) {
    super(scope, id);

    const { table, eventBus, bedrockRegion } = props;

    const handler = new DockerImageFunction(this, 'StreamingHandler', {
      code: DockerImageCode.fromImageAsset(join('..', 'app'), {
        file: 'job.Dockerfile',
        exclude: readFileSync(join('..', 'app', '.dockerignore'))
          .toString()
          .split('\n'),
        cmd: ['streaming-agent.handler'],
        platform: Platform.LINUX_AMD64,
      }),
      memorySize: 512,
      ephemeralStorageSize: Size.mebibytes(512),
      timeout: Duration.minutes(15),
      architecture: Architecture.X86_64,
      environment: {
        TABLE_NAME: table.tableName,
        EVENT_API_ENDPOINT: eventBus.httpEndpoint,
        EVENT_BUS_NAMESPACE: eventBus.defaultChannelName,
        BEDROCK_REGION: bedrockRegion,
        STREAMING_MODE: 'true',
      },
    });

    table.grantReadWriteData(handler);
    eventBus.api.grantConnect(handler);
    eventBus.api.grantPublishAndSubscribe(handler);

    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    this.handler = handler;

    new CfnOutput(this, 'StreamingHandlerFunctionName', { value: handler.functionName });
  }
}
