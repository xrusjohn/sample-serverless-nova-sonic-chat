# Python Canary Implementation TODO

## Goal
Create a production-ready canary system for the Python WebSocket stack that matches the Node.js canary functionality, with 99% code sharing between CLI and Lambda.

---

## Phase 1: Shared Canary Core ✅

### ✅ Task 1.1: Create `python-agent/canary_core.py`
**What:** Core canary logic used by both CLI and Lambda

**Functions to implement:**
- [x] `async def run_two_turn_test(ws_url, audio_chunks1, audio_chunks2, config={})` 
  - Connect to WebSocket
  - Send sessionStart, wait for ready
  - **Turn 1:** Send promptStart → contentStart → audioInput (continuous stream with silence)
  - Collect turn 1 audio response
  - Wait for turn 1 completion (second contentEnd(AUDIO))
  - Stream silence for audio_duration + 2s
  - **Turn 2:** Send audio on same content stream (no new contentStart)
  - Collect turn 2 audio response
  - Send contentEnd → promptEnd → sessionEnd
  - Return structured metrics

**Metrics to collect:**
- [x] `total_time` - Full test duration
- [x] `turn1_time` - Turn 1 duration (first audio sent → response complete)
- [x] `turn2_time` - Turn 2 duration
- [x] `connect_time` - WebSocket connection time
- [x] `turn1_send_time` - Time to send turn 1 audio
- [x] `turn1_reasoning_time` - Time from send complete → first response (TTFB)
- [x] `turn1_receive_time` - Time to receive full turn 1 response
- [x] `turn2_send_time`, `turn2_reasoning_time`, `turn2_receive_time` - Same for turn 2
- [x] `audio_chunks_received` - Count of audio chunks from agent
- [x] `transcript` - Text transcript with user/assistant separation

**Return format:**
```python
{
    'success': True/False,
    'error': None or error message,
    'metrics': { ... all timing metrics ... },
    'turn1_audio': [base64 chunks],
    'turn2_audio': [base64 chunks],
    'transcript': [{'turn': 1, 'text': '...'}, ...]
}
```

---

## Phase 2: CLI Wrapper ✅

### ✅ Task 2.1: Create `python-agent/canary_cli.py`
**What:** Command-line interface for manual testing

**Features:**
- [x] Parse CLI args: `--ws-url`, `--audio1`, `--audio2`, `--voice`, `--output-dir`
- [x] Load audio files from local filesystem
- [x] Convert audio to base64 chunks (16kHz, 16-bit, mono, 100ms chunks)
- [x] Call `canary_core.run_two_turn_test()`
- [x] Print results to console (timing breakdown, success/failure, transcript)
- [x] Save recordings to local directory (turn1_output.wav, turn2_output.wav)
- [x] Exit with code 0 (success) or 1 (failure)

**Usage example:**
```bash
python canary_cli.py \
  --ws-url wss://abc123.execute-api.us-east-1.amazonaws.com/production \
  --audio1 ../canary/audio/turn1.wav \
  --audio2 ../canary/audio/turn2.wav \
  --voice matthew \
  --output-dir ./recordings
```

### ✅ Task 2.2: Rename existing `canary_client.py` → `canary_client_old.py`
- [x] Kept old client as reference
- [x] New CLI fully replaces old implementation

---

## Phase 3: Lambda Handler ✅

### ✅ Task 3.1: Create `python-agent/sonic_canary_lambda.py`
**What:** Lambda handler for scheduled canary tests

**Features:**
- [x] Load audio files from S3 (env vars: `AUDIO_BUCKET`, `AUDIO_FILE1`, `AUDIO_FILE2`)
- [x] Convert S3 audio to base64 chunks
- [x] Call `canary_core.run_two_turn_test()` (same function as CLI!)
- [x] Publish CloudWatch metrics using boto3
- [x] Save recordings to S3 (bucket from env var: `RECORDINGS_BUCKET`)
- [x] Save transcript to S3
- [x] Return Lambda response with success/failure

**CloudWatch metrics to publish:**
```python
# Match Node.js canary metric names
- SonicCanaryPython/Success (1 or 0)
- SonicCanaryPython/TotalTime
- SonicCanaryPython/Turn1Time
- SonicCanaryPython/Turn2Time
- SonicCanaryPython/ConnectTime
- SonicCanaryPython/Turn1SendTime
- SonicCanaryPython/Turn1ReasoningTime
- SonicCanaryPython/Turn1ReceiveTime
- SonicCanaryPython/Turn2SendTime
- SonicCanaryPython/Turn2ReasoningTime
- SonicCanaryPython/Turn2ReceiveTime
```

**S3 structure:**
```
s3://bucket/recordings/YYYY-MM-DD-HH-MM-SS-sessionId/
  ├── turn1_input.wav
  ├── turn1_output.wav
  ├── turn2_input.wav
  ├── turn2_output.wav
  ├── transcript.json
  └── metrics.json
```

### ✅ Task 3.2: Update `python-agent/requirements.txt`
Add dependencies:
```
websockets>=12.0
boto3>=1.34.0
```

---

## Phase 4: Deployment Architecture Evaluation

### ☐ Task 4.1: Evaluate Deployment Options
**What:** Choose optimal deployment strategy for agent and canary

**Options:**

**Option A: Current Lambda Approach**
- ✅ Agent: Lambda + API Gateway WebSocket
- ✅ Canary: Lambda + EventBridge
- ✅ Pros: Simple, serverless, existing implementation
- ❌ Cons: Cold starts, 15min timeout limit

**Option B: AgentCore + ECS Hybrid** (Recommended to evaluate)
- 🔄 Agent: ECS Fargate (WebSocket server)
- 🔄 Canary: AgentCore Runtime (scheduled function)
- ✅ Pros: No cold starts for agent, AgentCore handles canary scheduling
- ❌ Cons: AgentCore doesn't support WebSocket servers
- 📝 Note: AgentCore Runtime perfect for canary (client-only, scheduled)

**Option C: Full AgentCore** (If WebSocket support added)
- 🔄 Agent: AgentCore Runtime (if WebSocket server support added)
- 🔄 Canary: AgentCore Runtime
- ✅ Pros: Unified platform, managed scaling, built-in observability
- ❌ Cons: Requires AgentCore WebSocket server support

**Option D: ECS + Lambda Hybrid**
- 🔄 Agent: ECS Fargate (WebSocket server)
- ✅ Canary: Lambda + EventBridge (current implementation)
- ✅ Pros: No cold starts for agent, simple canary
- ❌ Cons: Mixed deployment complexity

**Option E: Full ECS Fargate** (Unified container approach)
- 🔄 Agent: ECS Fargate (WebSocket server)
- 🔄 Canary: ECS Fargate (scheduled task)
- ✅ Pros: Unified deployment, no cold starts, no timeouts, consistent runtime
- ✅ Pros: Same Docker image for both services, shared code/dependencies
- ✅ Pros: Better resource control, persistent connections
- ❌ Cons: More complex than serverless, always-on costs for agent
- 📝 Note: Canary as scheduled ECS task (EventBridge → ECS RunTask)

### ☐ Task 4.2: AgentCore Canary Feasibility
**What:** Investigate AgentCore Runtime for canary deployment

**Research:**
- [ ] Check AgentCore Runtime Python support
- [ ] Verify scheduling capabilities (cron-like)
- [ ] Test WebSocket client connectivity from AgentCore
- [ ] Evaluate CloudWatch metrics integration
- [ ] Compare cost vs Lambda

**AgentCore Canary Benefits:**
- Built-in observability and monitoring
- Managed scaling and deployment
- Integrated with AWS services
- No cold start issues
- Potentially better cost model

### ☐ Task 4.3: ECS Fargate Feasibility
**What:** Evaluate ECS Fargate for both agent and canary

**Agent Research:**
- [ ] WebSocket connection handling at scale
- [ ] Load balancing for WebSocket connections (ALB sticky sessions)
- [ ] Auto-scaling based on connection count
- [ ] Cost comparison vs Lambda
- [ ] Deployment complexity

**Canary Research:**
- [ ] ECS scheduled tasks via EventBridge
- [ ] Task definition for one-time execution
- [ ] Container startup time vs Lambda cold start
- [ ] Cost per execution vs Lambda
- [ ] CloudWatch integration from containers

**ECS Benefits:**
- No timeout limits
- Persistent connections (agent)
- Consistent runtime environment
- Shared Docker image and dependencies
- Better resource control and monitoring
- No cold start issues

### ✅ Task 4.4: Architecture Decision Made
**Decision:** Hybrid approach with future ECS migration

**Phase 1: Lambda Canary (Current)**
- ✅ Canary: Lambda + EventBridge (simple, cost-effective for monitoring)
- ✅ Agent: Lambda + API Gateway (existing, works for demo/dev)
- ✅ Rationale: Serverless perfect for periodic canary testing

**Phase 2: ECS Migration (Future)**
- 🔄 Agent: Migrate to ECS Fargate (production traffic, no timeouts)
- 🔄 Load Testing: ECS tasks for multi-client load generation
- 🔄 Evaluation: ECS for complex multi-turn agent testing
- ✅ Rationale: ECS better for sustained connections, load testing, evaluation

**Growth Path:**
```
Canary CLI → Load Testing CLI → Multi-turn Evaluation CLI
     ↓              ↓                    ↓
 Lambda Canary → ECS Load Tests → ECS Evaluation Suite
```

**Benefits:**
- Start simple with Lambda canary
- Build ECS foundation for future growth
- Same `canary_core.py` works in both environments
- CLI grows into comprehensive testing suite

---

## Phase 5: CDK Infrastructure

**Strategy:** Implement both Lambda canary AND ECS foundation

**Current State:**
✅ `NovaSonicCanaryStack` exists with Python WebSocket API and agent Lambda  
✅ Stack has DynamoDB table, IAM permissions, API Gateway setup  
❌ **Missing:** Python canary Lambda function in same stack  

### ✅ Task 5.1: Add Lambda Canary to `nova-sonic-canary-stack.ts`
**What:** Add canary Lambda function for immediate monitoring

**Added to stack:**
- [x] Python canary Lambda function:
  - Runtime: Python 3.12
  - Handler: `sonic_canary_lambda.handler`
  - Timeout: 5 minutes
  - Memory: 512 MB
  - Code: `python-agent/` directory (same as agent)
  - Environment variables:
    - `WS_URL`: Uses `this.webSocketUrl` from existing stack
    - `AUDIO_BUCKET`: `sonic-canary-audio-441262788356-us-east-1`
    - `AUDIO_FILE1`: `turn1.wav`
    - `AUDIO_FILE2`: `turn2.wav`
    - `RECORDINGS_BUCKET`: `sonic-canary-transcripts-441262788356-us-east-1`
    - `VOICE_ID`: `matthew`
- [x] IAM permissions: S3 read/write, CloudWatch metrics
- [x] EventBridge rule: Schedule every 5 minutes
- [x] Stack outputs: `PythonCanaryFunctionName`S_URL`: Use `this.webSocketUrl` from existing stack
    - `AUDIO_BUCKET`: `sonic-canary-audio-441262788356-us-east-1`
    - `AUDIO_FILE1`: `turn1.wav`
    - `AUDIO_FILE2`: `turn2.wav`
    - `RECORDINGS_BUCKET`: `sonic-canary-transcripts-441262788356-us-east-1`
    - `VOICE_ID`: `matthew`
- [ ] IAM permissions: S3 read/write, CloudWatch metrics
- [ ] EventBridge rule: Schedule every 5 minutes

### ☐ Task 5.2: Add ECS Foundation (Future-ready)
**What:** Create ECS infrastructure for load testing and evaluation

**Add to stack:**
- [ ] ECS Cluster for Python services
- [ ] Task definition using same `python-agent/` code
- [ ] Service for WebSocket agent (optional, for production)
- [ ] Task definition for load testing (future)
- [ ] IAM roles for ECS tasks
- [ ] ALB for WebSocket load balancing (when needed)

### ☐ Task 5.3: Create Dockerfile
**What:** Containerize Python agent for ECS deployment

- [ ] Create `python-agent/Dockerfile`
- [ ] Multi-stage build (dependencies + app)
- [ ] Support both agent server and canary client modes
- [ ] Environment-based configuration
- [ ] Health checks for WebSocket serverucket)
  - S3 write (recordings bucket)
  - CloudWatch PutMetricData
- [ ] EventBridge rule: Schedule every 5 minutes
- [ ] Add stack output: `PythonCanaryFunctionName`

### ✅ Task 5.4: Deploy Enhanced Stack
**Status:** DEPLOYED! 🎉 (Committed: bab4712)

**Deployment Commands:**
```bash
cd cdk
npx cdk deploy NovaSonicCanaryStack
```

**Deployment Results:**
- ✅ Canary deployed and running every 5 minutes
- ✅ Metrics publishing to CloudWatch (SonicCanaryPython namespace)
- ✅ S3 recordings being saved
- ❌ Agent has event loop issues with API Gateway WebSocket
- 🔄 **Next:** Implement Lambda Web Adapter for agent

**Issue Identified:**
API Gateway WebSocket invokes Lambda separately for each message, causing async event loop conflicts when trying to maintain persistent Bedrock streaming connection across invocations.

**Solution:** Lambda Web Adapter
- Run existing WebSocket server (sonic_agent_local.py) in Lambda
- Persistent connection within single Lambda invocation
- No API Gateway WebSocket complexity
- Direct WebSocket via Lambda Function URL

---

## Phase 6: Lambda Web Adapter Implementation

### ❌ Task 6.1: Lambda Web Adapter (Doesn't Support WebSocket)
**What:** Replace API Gateway WebSocket with Lambda Web Adapter + Function URL

**Architecture Change:**
```
OLD: Client → API Gateway WebSocket → Lambda (per message) → Bedrock
NEW: Client → Lambda Function URL → Lambda Web Adapter → WebSocket Server → Bedrock
```

**Issue:** Lambda Web Adapter only supports HTTP/HTTPS, not WebSocket protocol.

**Attempted Implementation:**
- [x] Researched Lambda Web Adapter
- [x] Created run.sh and wrapper scripts
- [x] Updated sonic_agent_local.py for PORT env var
- ❌ **Blocked:** LWA doesn't support WebSocket

**Reverted to:** API Gateway WebSocket + Lambda (current deployment)

**Benefits:**
- ✅ Persistent WebSocket connection (up to 15 min)
- ✅ No event loop issues
- ✅ Reuse existing local agent code
- ✅ Simpler architecture
- ✅ Better streaming performance

### ✅ Task 6.2: Deploy Both ECS Fargate and App Runner

**Strategy:** Deploy agent in both ECS and App Runner for comparison

**Shared:**
- [x] Created Dockerfile for sonic_agent_local.py
- [x] Health check configuration
- [x] Environment variables (BEDROCK_REGION, PORT)

**ECS Fargate Implementation:**
- [x] Created `ecs-agent.ts` construct
- [x] VPC and ECS Cluster setup
- [x] Fargate task definition (1024 MB, 512 CPU)
- [x] Application Load Balancer with sticky sessions
- [x] Auto-scaling configuration
- [x] CloudWatch logs integration
- [ ] Deploy and test

**App Runner Implementation:**
- [x] Created `apprunner-agent.ts` construct
- [x] ECR image asset build
- [x] IAM roles for Bedrock access
- [x] Auto-scaling (default config)
- [x] Built-in HTTPS/WSS
- [ ] Deploy and test

**Comparison Points:**
- Deployment complexity
- Cold start behavior
- Auto-scaling responsiveness
- Cost (always-on vs traffic-based)
- WebSocket connection stability
- Operational overhead

### ✅ Task 6.3: Add Dashboard to Stack
**What:** Integrate CloudWatch dashboard with both Node.js and Python metrics

**Implementation:**
- [x] Import CanaryDashboard into NovaSonicCanaryStack
- [x] Add Python canary metrics to dashboard
- [x] Create comparison widgets (Node.js vs Python)
- [x] Dashboard shows both canary implementations side-by-side

**Dashboard Widgets:**
- Success rate comparison
- Total time comparison  
- Turn time comparison
- Connect time metrics
- Bedrock usage metrics

### ☐ Task 6.4: Deploy and Compare
**What:** Deploy both ECS and App Runner, test with canary

```bash
# Deploy with both agents
cd cdk
npx cdk deploy NovaSonicCanaryStack --all

# Test ECS endpoint
python sonic_canary_cli.py --ws-url <ECS_URL>

# Test App Runner endpoint  
python sonic_canary_cli.py --ws-url <APPRUNNER_URL>
```

**Metrics to Compare:**
- Connection establishment time
- Turn 1 & 2 latency
- Success rate
- Cost per hour
- Deployment time
**What:** Verify agent works with Lambda Web Adapter

```bash
# Deploy updated stack
cd cdk
npx cdk deploy NovaSonicCanaryStack

# Test with CLI
cd python-agent
python sonic_canary_cli.py --ws-url <FUNCTION_URL>
```

---

## Phase 7: Testing & Validation ⏳

### ☐ Task 7.1: Verify Deployment
**What:** Confirm canary is running successfully

**Quick Verification:**
```bash
# Get canary function name from stack outputs
aws cloudformation describe-stacks --stack-name NovaSonicCanaryStack \
  --query 'Stacks[0].Outputs[?OutputKey==`PythonCanaryFunctionName`].OutputValue' \
  --output text

# Check recent logs
aws logs tail /aws/lambda/<FUNCTION_NAME> --follow

# List CloudWatch metrics
aws cloudwatch list-metrics --namespace SonicCanaryPython

# Check S3 recordings
aws s3 ls s3://sonic-canary-transcripts-441262788356-us-east-1/recordings/ --recursive
```

**Expected Results:**
- ✅ Canary executes every 5 minutes
- ✅ Logs show successful 2-turn conversation
- ✅ Metrics published to `SonicCanaryPython` namespace
- ✅ Recordings saved to S3 with timestamp folders
- ✅ No errors in CloudWatch logs

### ☐ Task 7.2: Test CLI locally
```bash
cd python-agent
python canary_cli.py --ws-url wss://YOUR-URL --audio1 ../canary/audio/turn1.wav --audio2 ../canary/audio/turn2.wav
```
**Expected:** 2-turn conversation completes, timing metrics printed

### ☐ Task 7.3: Manual Canary Test (Optional)
**What:** Trigger canary manually to test immediately

```bash
# Invoke canary function manually
aws lambda invoke \
  --function-name <FUNCTION_NAME> \
  --payload '{}' \
  response.json

# Check response
cat response.json | jq .
```

**Expected:** Successful execution with metrics and recordings

### ☐ Task 7.4: Verify CloudWatch metrics
- [ ] Check CloudWatch console for `SonicCanaryPython` namespace
- [ ] Verify all metrics are publishing
- [ ] Check for failures (Success = 0)

### ☐ Task 7.5: Verify S3 recordings
- [ ] Check recordings bucket for timestamped folders
- [ ] Verify audio files are valid WAV format
- [ ] Verify transcript.json has conversation data

---

## Phase 7: Dashboard (Optional)

### ☐ Task 6.1: Add Python metrics to existing dashboard
Update `cdk/lib/constructs/canary-dashboard.ts`:
- [ ] Add Python canary metrics alongside Node.js metrics
- [ ] Create comparison graphs (Node.js vs Python)
- [ ] Add Python-specific alarms

### ☐ Task 6.2: Or create separate Python dashboard
Create `cdk/lib/constructs/python-canary-dashboard.ts`:
- [ ] Success rate graph
- [ ] Latency breakdown graph
- [ ] Turn timing comparison
- [ ] Alarms for failures

---

## Phase 8: Documentation

### ☐ Task 7.1: Update `PYTHON_DEPLOYMENT.md`
- [ ] Add canary usage instructions
- [ ] Document CLI usage
- [ ] Document metrics and monitoring
- [ ] Add troubleshooting section

### ☐ Task 7.2: Create `python-agent/CANARY.md`
- [ ] Architecture diagram
- [ ] Code sharing explanation
- [ ] Metric definitions
- [ ] How to customize audio files

---

## Success Criteria

✅ **CLI works:** Can run 2-turn test from command line  
☐ **Lambda works:** Scheduled canary runs every 5 minutes  
☐ **Metrics publish:** All timing metrics appear in CloudWatch  
☐ **Recordings saved:** Audio and transcripts saved to S3  
✅ **Code shared:** 99% of logic in `canary_core.py`  
✅ **Continuous audio stream:** Maintains single audio content throughout conversation  
✅ **Proper turn boundaries:** Streams silence between turns to prevent interruption  

---

## Estimated Time

- ✅ Phase 1 (Core): 2-3 hours → **COMPLETED**
- ✅ Phase 2 (CLI): 1 hour → **COMPLETED**
- ✅ Phase 3 (Lambda): 1-2 hours → **COMPLETED**
- Phase 4 (Architecture): 1 hour
- Phase 5 (CDK): 1-2 hours
- Phase 6 (Testing): 1 hour
- Phase 7 (Dashboard): 1 hour (optional)
- Phase 8 (Docs): 30 minutes

**Total: 8-11 hours** | **Completed: ~5 hours** | **Remaining: ~3-6 hours**

**NEXT:** Evaluate AgentCore + ECS deployment options before implementing CDK

---

## Notes

- Reuse audio files from `canary/audio/` directory (turn1.wav, turn2.wav)
- Match Node.js metric names for consistency
- Consider adding Python canary to same dashboard as Node.js canary
- Test with different audio files to ensure robustness
