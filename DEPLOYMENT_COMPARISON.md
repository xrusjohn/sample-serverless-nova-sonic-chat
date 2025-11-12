# Nova Sonic Agent Deployment Comparison

This project deploys the Python WebSocket agent in **three different ways** for comparison and learning.

## Deployment Options

### 1. Lambda + API Gateway WebSocket
**Status:** ⚠️ Deployed (has event loop issues)

**Architecture:**
```
Client → API Gateway WebSocket → Lambda (per message) → Bedrock
```

**Pros:**
- ✅ Serverless, pay-per-use
- ✅ Auto-scaling
- ✅ Simple for low traffic

**Cons:**
- ❌ Event loop issues across invocations
- ❌ 15-minute timeout
- ❌ Complex async handling
- ❌ Cold starts

**Use Case:** Low-traffic testing, cost-sensitive scenarios

---

### 2. ECS Fargate
**Status:** 🚀 Ready to deploy

**Architecture:**
```
Client → ALB (sticky sessions) → ECS Fargate Task → Bedrock
```

**Pros:**
- ✅ Persistent connections
- ✅ No timeouts
- ✅ Production-grade
- ✅ Full control over resources
- ✅ Great for load testing

**Cons:**
- ❌ More complex infrastructure
- ❌ Always-on costs
- ❌ Requires VPC, ALB, ECS cluster

**Use Case:** Production traffic, load testing, long sessions

**Configuration:**
- CPU: 512 (0.5 vCPU)
- Memory: 1024 MB
- Auto-scaling: Based on CPU/memory
- Health checks: TCP on port 9000
- Sticky sessions: Enabled

---

### 3. App Runner
**Status:** 🚀 Ready to deploy

**Architecture:**
```
Client → App Runner (managed) → Container → Bedrock
```

**Pros:**
- ✅ Simplest deployment
- ✅ Persistent connections
- ✅ Built-in HTTPS/WSS
- ✅ Auto-scaling
- ✅ No infrastructure management

**Cons:**
- ❌ Less control than ECS
- ❌ Always-on costs
- ❌ Limited customization

**Use Case:** Quick production deployment, minimal ops overhead

**Configuration:**
- CPU: 1 vCPU
- Memory: 2 GB
- Auto-scaling: Automatic (traffic-based)
- Health checks: TCP on port 9000
- TLS: Built-in

---

## Deployment

### Deploy All Three
```bash
cd cdk
npx cdk deploy NovaSonicCanaryStack
```

### Stack Outputs
```
LambdaWebSocketURL     = wss://xxx.execute-api.us-east-1.amazonaws.com/production
EcsWebSocketURL        = ws://xxx.us-east-1.elb.amazonaws.com
AppRunnerWebSocketURL  = wss://xxx.us-east-1.awsapprunner.com
```

## Testing

### Test Each Endpoint
```bash
cd python-agent

# Test Lambda
python sonic_canary_cli.py --ws-url <LambdaWebSocketURL>

# Test ECS
python sonic_canary_cli.py --ws-url <EcsWebSocketURL>

# Test App Runner
python sonic_canary_cli.py --ws-url <AppRunnerWebSocketURL>
```

## Comparison Metrics

| Metric | Lambda | ECS Fargate | App Runner |
|--------|--------|-------------|------------|
| **Deployment Time** | ~5 min | ~10 min | ~8 min |
| **Cold Start** | Yes (~2s) | Minimal | Minimal |
| **Connection Timeout** | 15 min | None | None |
| **Auto-scaling** | Instant | ~1-2 min | ~30s |
| **Cost (idle)** | $0 | ~$15/mo | ~$12/mo |
| **Cost (active)** | Per invocation | Per hour | Per hour |
| **Ops Complexity** | Low | High | Low |
| **WebSocket Support** | ⚠️ Complex | ✅ Native | ✅ Native |

## Recommendations

**For Development/Testing:**
- Use **Lambda** (cheapest, good enough for testing)

**For Production:**
- Use **App Runner** (simplest, production-ready)
- Use **ECS Fargate** (most control, best for scale)

**For Load Testing:**
- Use **ECS Fargate** (can scale to many tasks)

## Cost Estimates

**Assumptions:** 1000 sessions/day, 5 min avg session

| Deployment | Monthly Cost |
|------------|--------------|
| Lambda | ~$50 (compute + API Gateway) |
| ECS Fargate | ~$30 (1 task always on) |
| App Runner | ~$25 (traffic-based scaling) |

**Note:** Bedrock costs are the same across all deployments (~$0.04/session)

## Next Steps

1. Deploy all three
2. Run canary tests against each
3. Compare metrics in CloudWatch
4. Choose deployment based on requirements
5. Decommission unused deployments

## Files

```
python-agent/
├── Dockerfile                    # Shared by ECS and App Runner
├── sonic_agent_local.py          # WebSocket server
├── sonic_agent_lambda.py         # Lambda handler
└── sonic_canary_cli.py           # Testing tool

cdk/lib/constructs/
├── ecs-agent.ts                  # ECS Fargate deployment
└── apprunner-agent.ts            # App Runner deployment
```
