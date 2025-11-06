## Quick context (what this repo does)

Serverless Nova Sonic Chat: a Next.js webapp + an AWS Lambda "agent" that runs the Nova Sonic bidirectional speech stream (Bedrock). The webapp handles UI, auth (Cognito), and real-time front-end <-> backend messaging via AppSync Events. The agent runs as a Docker image in Lambda and manages long-running, stateful Nova Sonic conversations and resume logic.

Key directories to reference:
- `app/src/agent/` — Nova Sonic agent runtime, stream orchestration, tools (see `index.ts`, `nova-stream.ts`, `events.ts`).
- `app/src/agent/tools/` — inline tools available to the agent (example: `weather`, `account-number`). Tools implement `ToolDefinition` from `app/src/agent/tools/common.ts`.
- `app/src/common/` — persistence and helper utilities (`messageRepository.ts`, `sessionRepository.ts`, event sequencer).
- `cdk/` — AWS CDK constructs and infra config (agent Lambda built as container image, AppSync Events channel, DynamoDB tables). See `cdk/lib/constructs/agent.ts` and `cdk/lib/constructs/service.ts` for how infra wires the agent and web service.

What to focus on when changing code
- Preserve the stream contract in `nova-stream.ts`: event shapes (sessionStart, promptStart, contentStart, audioInput, toolUse, contentEnd) are encoded as JSON chunks for Bedrock's InvokeModelWithBidirectionalStream API. Changing the shape requires updates in `events.ts` and any client event handling.
- Tools: each tool must export a `ToolDefinition` with `name`, `handler`, `schema` (Zod), and `toolSpec()` that returns a JSON schema string. Tool results are sent back using `enqueueToolResult` -> `contentEnd` with type `TOOL`.
- Resume behavior: the agent disconnects and reopens Nova Sonic streams; chat history slicing rules are enforced in `nova-stream.sliceChatHistory` (length limits, role ordering). Keep these rules if changing history handling.

Developer workflows & commands
- Webapp (development):
  - Start dev server: from `app/` run `npm run dev` (uses `next dev --turbopack -p 3005`).
  - Build: `npm run build` in `app/`.
  - Tests: `npm test` runs `vitest`.
  - Lint: `npm run lint`.

- CDK / infra:
  - Install deps: `cd cdk && npm ci`.
  - Bootstrap (first-time): `cd cdk && npx cdk bootstrap`.
  - Deploy: `cd cdk && npx cdk deploy`.
  - Destroy: `cd cdk && npx cdk destroy --all`.

Project-specific conventions and patterns
- Server Actions (Next.js): prefer Next.js Server Actions with `next-safe-action` for server-side mutations inside the app (see `app/CLAUDE.md` and `app/src/lib/safe-action.ts`). Server Actions files must include the `'use server'` pragma and export only the action.
- Amplify AppSync Events: the webapp connects to AppSync Events channels (`events.connect`) and publishes/subscribes using a simple JSON event schema validated by Zod schemas in `app/src/common/schemas.ts`. When editing event names/fields, update `SpeechToSpeechEventSchema` and `events.ts` handlers.
- Agent isolation: one Lambda instance per session (no multiplexing). The Lambda image command is `agent.handler` (see `cdk/lib/constructs/agent.ts` and Dockerfile). Any change to Lambda handler entrypoints must be reflected in CDK image command and `package` assets.

Integration points & external dependencies to be aware of
- Bedrock (Nova Sonic): invoked via `@aws-sdk/client-bedrock-runtime` using the bidirectional stream API. The stream code uses HTTP/2 Node handler (`NodeHttp2Handler`) and sets modelId `amazon.nova-sonic-v1:0` in `nova-stream.ts`.
- AppSync Events: realtime transport between client and Lambda agent. Channel paths are built as `/${process.env.EVENT_BUS_NAMESPACE}/user/${userId}/${sessionId}`.
- DynamoDB: chat histories and sessions persist to DynamoDB via `MessageRepository` and `SessionRepository`. If you rename tables or change schema, update CDK in `cdk/lib/constructs/database.ts` and repository code.
- Cognito: the app uses Cognito for auth (configured via CDK). UI auth callbacks are implemented in `app/src/app/api/auth/` and `app/src/app/api/cognito-token/route.ts`.

Examples from the codebase (do these exact things)
- Register a tool: add a file under `app/src/agent/tools/` exporting a `ToolDefinition` and import it in `app/src/agent/index.ts` tools array (example: `getWeatherTool` in `tools/weather/index.ts`). Ensure `toolSpec()` returns JSON-schema via `zodToJsonSchemaBody`.
- Enqueue audio from client: client sends `audioInput` events; the server side uses `AudioEventSequencer` to merge and then calls `stream.enqueueAudioInput(chunks)` (see `events.initializeSubscription`).
- Save assistant messages: finalized assistant text outputs are saved via `MessageRepository.saveMessage(sessionId, { role, content })` inside `processResponseStream` only when content is final.

What an AI agent should NOT change without human review
- Nova Sonic event protocol (`nova-stream.ts`) and AppSync event schema — breaking changes here require coordinating frontend + infra updates.
- CDK resource names, environment variable keys, or Lambda image command (used by CDK to wire components). These are referenced across `cdk/` and `app/` (env var `NOVA_SONIC_LAMBDA_FUNCTION_NAME`, `EVENT_BUS_NAMESPACE`, `BEDROCK_REGION`, `TABLE_NAME`).

Where to look for tests and quick checks
- Unit tests: front-end tests run with `vitest` (`app/`), CDK tests use `jest` in `cdk/`.
- Quick runtime sanity: start the webapp with `npm run dev` and check `http://localhost:3005`. Local full integration requires AWS infra.

If you need to wire new infra or change runtime envs
- Update `cdk/lib/constructs/*` and run `cdk synth` locally to preview changes, then `npx cdk deploy`.
- Add new environment variables in `cdk` constructs (see how `NOVA_SONIC_LAMBDA_FUNCTION_NAME` and `EVENT_API_ENDPOINT` are passed into the service image).

Contact points in the repo
- Agent runtime: `app/src/agent/index.ts`, `nova-stream.ts`, `events.ts` — read these first when debugging voice/stream issues.
- Tools: `app/src/agent/tools/*`.
- Persistence: `app/src/common/*`.
- Infra: `cdk/lib/constructs/*` and `cdk/bin/cdk.ts`.

If anything above is unclear, tell me which area to expand (agent streams, tools, AppSync events, CDK wiring, or Next.js server actions) and I will update this file accordingly.
