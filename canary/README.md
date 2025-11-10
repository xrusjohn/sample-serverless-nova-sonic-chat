# Nova Sonic Canary Testing System

Automated end-to-end testing system that validates the Nova Sonic chat functionality every 15 minutes.

## Overview

The canary system performs a complete two-turn conversation test:
1. Creates a DynamoDB session (matching app behavior)
2. Invokes the agent Lambda function
3. Waits for the 'ready' event from AppSync Events
4. Sends audio input and validates speech response
5. Performs a second turn to test conversation continuity
6. Stores test results and audio files in S3

## Architecture

- **Lambda Function**: Executes the test logic using IAM authentication
- **EventBridge Rule**: Triggers canary every 15 minutes
- **S3 Buckets**: Stores test results and audio files
- **AppSync Events**: Real-time communication with agent (same as web app)
- **DynamoDB**: Session management (same table as web app)

## Key Components

### Test Flow
1. **Session Creation**: Creates DynamoDB session entry before invoking agent
2. **Agent Invocation**: Calls agent Lambda with session ID and user ID
3. **Ready Wait**: Waits for agent to send 'ready' event via AppSync Events
4. **Audio Test**: Sends base64-encoded audio and validates response
5. **Conversation Test**: Performs second turn to test memory/context

### Authentication
- Uses IAM authentication for AppSync Events (different from web app's Cognito auth)
- Requires AppSync Events IAM permissions for canary Lambda role

### Storage
- **Results Bucket**: Stores JSON test results with timestamps and status
- **Audio Bucket**: Stores input/output audio files for debugging

## Deployment

The canary is automatically deployed as part of the main CDK stack:

```typescript
// In cdk-stack.ts
const canary = new Canary(this, 'Canary', {
  agentLambda: agent.lambda,
  eventBus: eventBus.eventBus,
  tableName: database.table.tableName,
});
```

## Monitoring

### CloudWatch Logs
- Check Lambda execution logs for detailed test output
- View logs: `/aws/lambda/<CanaryFunctionName>`

### CloudWatch Metrics
Metrics are published to the `SonicCanary` namespace without dimensions for easy aggregation:

- **CanarySuccess**: 1 for success, 0 for failure
- **CanaryTotalTime**: Total test duration (ms)
- **CanaryTurn1Time**: First conversation turn duration (ms)
- **CanaryTurn2Time**: Second conversation turn duration (ms)
- **CanaryChannelConnectTime**: AppSync Events connection time (ms)
- **CanaryAgentInvokeTime**: Agent Lambda invocation time (ms)
- **CanaryReadyWaitTime**: Time waiting for agent ready event (ms)
- **CanaryAudioLoadTime**: Time to load audio from S3 (ms)

**Dashboard Setup:**
- Use **Stacked Area Chart** to visualize timing breakdown
- Set **Period to 15 minutes** to align with canary frequency
- Metrics appear within 1-3 minutes of test completion

### S3 Storage
- Test results and audio files stored in S3 buckets
- Useful for debugging failures and analyzing audio quality

## Configuration

The canary runs every 15 minutes by default. To modify the schedule, update the EventBridge rule in `canary.ts`:

```typescript
const rule = new events.Rule(this, 'CanaryRule', {
  schedule: events.Schedule.rate(cdk.Duration.minutes(15)), // Modify here
});
```