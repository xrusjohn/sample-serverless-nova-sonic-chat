# Nova Sonic Serverless Chat - AI Agent Instructions

## Architecture Overview
Serverless real-time voice chat using Nova Sonic (Bedrock) with Next.js frontend and Lambda agent backend. The agent runs as a containerized Lambda function managing bidirectional audio streams, while the webapp handles UI and auth via AppSync Events for real-time communication.

**Key Components:**
- `app/src/agent/` - Nova Sonic stream orchestration and tool execution
- `app/src/common/` - DynamoDB repositories and event schemas  
- `cdk/lib/constructs/` - Infrastructure as code (Lambda containers, AppSync, DynamoDB)

## Critical Patterns

### Nova Sonic Stream Protocol
The stream contract in `nova-stream.ts` uses specific JSON event shapes for Bedrock's bidirectional API:
- `sessionStart` → `promptStart` → `contentStart` → `audioInput`/`toolUse` → `contentEnd`
- Chat history slicing enforces 1024 char/message, 40960 total, User-first ordering
- Resume logic: agent disconnects/reconnects streams every 2-8 minutes due to Nova Sonic limits

### Tool Implementation Pattern
```typescript
// app/src/agent/tools/example/index.ts
export const exampleTool: ToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'toolName',
  handler: async (input) => { /* logic */ },
  schema: zodSchema,
  toolSpec: () => ({ name, description, inputSchema: { json: JSON.stringify(zodToJsonSchemaBody(schema)) }})
};
```
Register in `app/src/agent/index.ts` tools array.

### Server Actions (Next.js)
Always use `next-safe-action` with `'use server'` pragma:
```typescript
'use server';
export const myAction = authActionClient
  .inputSchema(schema)
  .action(async ({ parsedInput }) => { /* logic */ });
```

### AppSync Events Schema
Bidirectional events validated by `SpeechToSpeechEventSchema` in `app/src/common/schemas.ts`:
- `btoc` (backend→client): `ready`, `audioOutput`, `textStart/Output/Stop`, `end`
- `ctob` (client→backend): `audioInput`, `terminateSession`

## Development Commands

**Webapp:**
- `cd app && npm run dev` - Dev server on :3005
- `npm run build` - Production build
- `npm test` - Vitest tests

**Infrastructure:**
- `cd cdk && npm ci` - Install dependencies
- `npx cdk bootstrap` - First-time setup
- `npx cdk deploy` - Deploy all stacks
- `npx cdk destroy --all` - Cleanup

## Environment Variables (CDK→Lambda)
- `NOVA_SONIC_LAMBDA_FUNCTION_NAME` - Agent function name
- `EVENT_BUS_NAMESPACE` - AppSync channel namespace
- `BEDROCK_REGION` - Nova Sonic model region (default: us-east-1)
- `TABLE_NAME` - DynamoDB table for messages/sessions

## What NOT to Change Without Review
- Nova Sonic event protocol shapes in `nova-stream.ts`
- AppSync event schema in `schemas.ts` 
- CDK environment variable names (referenced across app/cdk)
- Lambda container commands in `agent.ts` construct

## Quick Integration Points
- **Add tool**: Create in `tools/`, export `ToolDefinition`, import in `agent/index.ts`
- **Modify events**: Update `schemas.ts` Zod schema + `events.ts` handlers
- **Change infra**: Edit `cdk/lib/constructs/*`, run `cdk synth` to preview
- **Debug streams**: Check `agent/index.ts`, `nova-stream.ts`, `events.ts` first

## Repository Patterns
- `MessageRepository.saveMessage()` - Persist chat history to DynamoDB
- `SessionRepository.updateSystemPrompt()` - Update session metadata
- `AudioEventSequencer` - Merge client audio chunks before sending to Nova Sonic