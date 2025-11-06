# Sonic CLI Canary

A headless command-line canary for testing Nova Sonic chat functionality without a browser.

## Setup

```bash
cd canary/cli
npm install
```

## Usage

Set required environment variables and run:

```bash
export EVENT_BUS_NAMESPACE="your-namespace"
export EVENT_API_ENDPOINT="https://your-appsync-endpoint"
export AGENT_HANDLER_FUNCTION_NAME="your-agent-lambda-function"
export AWS_REGION="us-east-1"

npm start
```

## What it does

1. Connects to AppSync Events using IAM authentication
2. Invokes the Nova Sonic agent Lambda function
3. Waits for the 'ready' event
4. Sends test audio from `../audio/test-audio.raw`
5. Collects and displays the text response
6. Reports success/failure

## Environment Variables

- `EVENT_BUS_NAMESPACE`: AppSync Events namespace
- `EVENT_API_ENDPOINT`: AppSync Events endpoint URL
- `AGENT_HANDLER_FUNCTION_NAME`: Lambda function name for the agent handler
- `AWS_REGION`: AWS region (default: us-east-1)

## Exit Codes

- `0`: Test passed
- `1`: Test failed
