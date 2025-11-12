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

## Phase 3: Lambda Handler

### ☐ Task 3.1: Create `python-agent/canary_lambda.py`
**What:** Lambda handler for scheduled canary tests

**Features:**
- [ ] Load audio files from S3 (env vars: `AUDIO_BUCKET`, `AUDIO_FILE1`, `AUDIO_FILE2`)
- [ ] Convert S3 audio to base64 chunks
- [ ] Call `canary_core.run_two_turn_test()` (same function as CLI!)
- [ ] Publish CloudWatch metrics using boto3
- [ ] Save recordings to S3 (bucket from env var: `RECORDINGS_BUCKET`)
- [ ] Save transcript to S3
- [ ] Return Lambda response with success/failure

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

### ☐ Task 3.2: Update `python-agent/requirements.txt`
Add dependencies:
```
websockets>=12.0
boto3>=1.34.0
```

---

## Phase 4: CDK Infrastructure

### ☐ Task 4.1: Add Canary to `cdk/lib/python-websocket-stack.ts`
**What:** Add Lambda canary function and schedule

**Add to stack:**
- [ ] Create S3 bucket for audio files (or reuse existing)
- [ ] Create S3 bucket for recordings (or reuse existing)
- [ ] Upload audio files to S3 (from `canary/audio/` directory)
- [ ] Create Lambda function:
  - Runtime: Python 3.12
  - Handler: `canary_lambda.handler`
  - Timeout: 5 minutes
  - Memory: 512 MB
  - Code: `python-agent/` directory
  - Environment variables:
    - `WS_URL`: WebSocket API URL (from stack output)
    - `AUDIO_BUCKET`: S3 bucket with audio files
    - `AUDIO_FILE1`: `turn1.wav`
    - `AUDIO_FILE2`: `turn2.wav`
    - `RECORDINGS_BUCKET`: S3 bucket for recordings
    - `VOICE_ID`: `matthew`
- [ ] IAM permissions:
  - S3 read (audio bucket)
  - S3 write (recordings bucket)
  - CloudWatch PutMetricData
- [ ] EventBridge rule: Schedule every 5 minutes
- [ ] Add stack output: `CanaryFunctionName`

### ☐ Task 4.2: Create `cdk/lib/constructs/python-canary.ts` (optional)
Extract canary into separate construct for cleaner code (like Node.js version)

---

## Phase 5: Testing & Validation

### ☐ Task 5.1: Test CLI locally
```bash
cd python-agent
python canary_cli.py --ws-url wss://YOUR-URL --audio1 ../canary/audio/turn1.wav --audio2 ../canary/audio/turn2.wav
```
**Expected:** 2-turn conversation completes, timing metrics printed

### ☐ Task 5.2: Deploy and test Lambda
```bash
cd cdk
npx cdk deploy SonicAgentPythonStack
```
**Expected:** Lambda runs every 5 minutes, metrics appear in CloudWatch

### ☐ Task 5.3: Verify CloudWatch metrics
- [ ] Check CloudWatch console for `SonicCanaryPython` namespace
- [ ] Verify all metrics are publishing
- [ ] Check for failures (Success = 0)

### ☐ Task 5.4: Verify S3 recordings
- [ ] Check recordings bucket for timestamped folders
- [ ] Verify audio files are valid WAV format
- [ ] Verify transcript.json has conversation data

---

## Phase 6: Dashboard (Optional)

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

## Phase 7: Documentation

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
- Phase 3 (Lambda): 1-2 hours
- Phase 4 (CDK): 1-2 hours
- Phase 5 (Testing): 1 hour
- Phase 6 (Dashboard): 1 hour (optional)
- Phase 7 (Docs): 30 minutes

**Total: 7-10 hours** | **Completed: ~3 hours** | **Remaining: ~4-7 hours**

---

## Notes

- Reuse audio files from `canary/audio/` directory (turn1.wav, turn2.wav)
- Match Node.js metric names for consistency
- Consider adding Python canary to same dashboard as Node.js canary
- Test with different audio files to ensure robustness
