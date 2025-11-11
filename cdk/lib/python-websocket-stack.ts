import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

interface SonicAgentPythonStackProps extends cdk.StackProps {
  readonly bedrockRegion?: string;
  readonly table?: dynamodb.ITable;
}

export class SonicAgentPythonStack extends cdk.Stack {
  public readonly webSocketUrl: string;
  public readonly handler: lambda.Function;

  constructor(scope: Construct, id: string, props: SonicAgentPythonStackProps) {
    super(scope, id, props);

    const bedrockRegion = props.bedrockRegion || 'us-east-1';

    // Use existing table or create new one
    const table = props.table || new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Python Lambda handler
    this.handler = new lambda.Function(this, 'AgentHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('../python-agent'),
      timeout: cdk.Duration.minutes(15),
      memorySize: 1024,
      environment: {
        TABLE_NAME: table.tableName,
        BEDROCK_REGION: bedrockRegion,
      },
    });

    // Grant permissions
    table.grantReadWriteData(this.handler);
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModelWithResponseStream', 'bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${bedrockRegion}::foundation-model/*`],
      })
    );

    // WebSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', this.handler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', this.handler),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('DefaultIntegration', this.handler),
      },
    });

    const stage = new apigatewayv2.WebSocketStage(this, 'ProductionStage', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    // Grant API Gateway permission to invoke Lambda
    this.handler.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`,
    });

    // Grant Lambda permission to post to connections
    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
      })
    );

    this.webSocketUrl = stage.url;

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: this.webSocketUrl,
      description: 'Python WebSocket API URL',
    });
  }
}
