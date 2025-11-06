# Canary Refactor - Pluggable Architecture

The canary has been refactored into a pluggable architecture that supports multiple agent deployment types.

## Structure

```
canary/cli/
├── canary-core.js         # Core canary logic (agent-agnostic)
├── canary-lambda.js       # Lambda-specific wrapper
├── canary-agentcore.js    # AgentCore-specific wrapper
├── audio-utils.js         # Shared audio utilities
└── .env                   # Configuration
```

## Usage

### Lambda Deployment
```bash
node canary-lambda.js good_morning_nova.wav good_morning_nova.wav
```

### AgentCore Deployment
```bash
node canary-agentcore.js good_morning_nova.wav good_morning_nova.wav
```

## Configuration (.env)

```bash
# Common settings (required for both)
EVENT_BUS_NAMESPACE=event-bus
EVENT_API_ENDPOINT=https://xxx.appsync-api.us-east-1.amazonaws.com
AWS_REGION=us-east-1

# Lambda-specific
AGENT_HANDLER_FUNCTION_NAME=YourLambdaFunctionName

# AgentCore-specific
AGENTCORE_AGENT_ID=your-agent-id
AGENTCORE_AGENT_ALIAS_ID=TSTALIASID
```

## Creating a New Deployment Type

To add support for a new deployment type (e.g., ECS, Fargate):

1. Create `canary-{type}.js`
2. Implement `invokeAgent` function:
   ```javascript
   async function invokeYourAgent(params) {
     // params: { sessionId, userId, systemPrompt, voiceId, mcpConfig }
     // Start your agent session
     // Return: { success: boolean, error?: string }
   }
   ```
3. Call `runTwoTurnCanary` with your config:
   ```javascript
   const result = await runTwoTurnCanary({
     invokeAgent: invokeYourAgent,
     eventApiEndpoint: process.env.EVENT_API_ENDPOINT,
     eventBusNamespace: process.env.EVENT_BUS_NAMESPACE,
     awsRegion: process.env.AWS_REGION,
     audioFile1: path.join(__dirname, '../audio', audioFile1),
     audioFile2: path.join(__dirname, '../audio', audioFile2),
     recordingDir: path.join(__dirname, '../recordings')
   });
   ```

## Sharing Across Projects

### Option 1: NPM Package (Recommended)
Extract `canary-core.js` and `audio-utils.js` to a separate npm package:

```bash
# Create package
mkdir sonic-canary
cd sonic-canary
npm init -y

# Copy core files
cp ../sonic-cdk-lambda/canary/cli/canary-core.js .
cp ../sonic-cdk-lambda/canary/cli/audio-utils.js .

# In both projects
npm install file:../sonic-canary
```

### Option 2: Git Submodule
```bash
# Create canary repo
git init sonic-canary
# Move core files to sonic-canary

# In each project
git submodule add <canary-repo-url> canary
```

### Option 3: Symlink (Local Development)
```bash
# Create shared location
mkdir ~/shared/sonic-canary
mv canary/cli/* ~/shared/sonic-canary/

# Symlink from projects
ln -s ~/shared/sonic-canary sonic-cdk-lambda/canary/cli
ln -s ~/shared/sonic-canary sonic-agentcore/canary/cli
```

## Migration from Old Canary

The old `canary.js` is now replaced by `canary-lambda.js`. Both work identically:

```bash
# Old way (still works)
node canary.js good_morning_nova.wav good_morning_nova.wav

# New way (recommended)
node canary-lambda.js good_morning_nova.wav good_morning_nova.wav
```
