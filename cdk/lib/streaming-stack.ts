import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EventBus } from './constructs/event-bus';
import { Database } from './constructs/database';
import { StreamingAgent } from './constructs/streaming-agent';
import { Auth } from './constructs/auth';
import { Service } from './constructs/service';
import { StreamingCanary } from './constructs/streaming-canary';

interface StreamingStackProps extends cdk.StackProps {
  readonly selfSignUpEnabled?: boolean;
  readonly allowedEmailDomainList?: string[];
  readonly bedrockRegion?: string;
}

export class StreamingNovaSonicStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: StreamingStackProps) {
    super(scope, id, props);

    const bedrockRegion = props?.bedrockRegion ?? 'us-east-1';

    const database = new Database(this, 'Database', {});
    
    const auth = new Auth(this, 'Auth', {
      selfSignUpEnabled: props?.selfSignUpEnabled ?? true,
      allowedEmailDomainList: props?.allowedEmailDomainList,
    });

    const eventBus = new EventBus(this, 'EventBus', {
      userPool: auth.userPool,
    });
    
    const streamingAgent = new StreamingAgent(this, 'StreamingAgent', {
      table: database.table,
      eventBus,
      bedrockRegion,
    });

    const service = new Service(this, 'Service', {
      table: database.table,
      auth,
      eventBus,
      agentHandler: streamingAgent.handler,
    });

    new StreamingCanary(this, 'StreamingCanary', {
      serviceApiEndpoint: service.endpoint,
      agentHandler: streamingAgent.handler,
    });
  }
}
