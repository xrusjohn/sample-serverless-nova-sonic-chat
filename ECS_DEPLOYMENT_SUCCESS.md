# ECS Deployment Success ✅

**Date:** November 13, 2025  
**Status:** DEPLOYED AND STABLE

## Issue Resolved

The ECS Fargate deployment was experiencing a restart loop due to ALB health check failures.

### Root Cause
- ALB health checks were sending regular HTTP GET requests to `/health`
- WebSocket server correctly returned HTTP 426 (Upgrade Required) for non-WebSocket requests
- ALB was configured to only accept HTTP 200 as healthy, causing it to mark targets as unhealthy
- ECS kept restarting tasks due to failed health checks

### Solution
Updated `cdk/lib/sonic-canary-service-stack.ts` to accept HTTP 426 as a healthy response:

```typescript
healthCheck: {
  path: '/health',
  protocol: elbv2.Protocol.HTTP,
  healthyThresholdCount: 2,
  unhealthyThresholdCount: 5,
  timeout: cdk.Duration.seconds(10),
  interval: cdk.Duration.seconds(30),
  healthyHttpCodes: '200,426',  // ← Key fix
}
```

Also increased health check grace period:
```typescript
healthCheckGracePeriod: cdk.Duration.seconds(120)
```

### Additional Improvements
Updated `python-agent/sonic_agent_local.py` to suppress expected health check errors in logs:

```python
def handle_exception(loop, context):
    exception = context.get('exception')
    if exception:
        exc_str = str(exception)
        if 'missing Connection header' in exc_str:
            return  # Suppress health check errors
```

## Current Status

✅ **Service:** ACTIVE and stable  
✅ **Tasks:** 1 running, 0 pending  
✅ **Target Health:** 1 healthy, 0 unhealthy  
✅ **No restart loops**

## Architecture

```
Client → ALB (HTTP 80) → ECS Fargate (WebSocket Server on port 9000) → Bedrock Nova Sonic
                ↓
         Health Check: /health
         Accepts: 200, 426
```

## Deployment Details

- **Stack:** SonicCanaryServiceStack
- **Cluster:** SonicCanaryFoundationStack-ClusterEB0386A7-od6mo54cpT6V
- **Service:** SonicCanaryServiceStack-ServiceD69D759B-pGJeOKq9vg0T
- **WebSocket URL:** ws://SonicC-ALBAE-FPmwPvBzhcxN-269867150.us-east-1.elb.amazonaws.com
- **Task Definition:** 2048 MB memory, 1024 CPU
- **Container:** Python 3.12 WebSocket server

## Key Learnings

1. **HTTP 426 is correct:** WebSocket servers should return 426 for non-upgrade requests
2. **ALB health checks:** Must configure `healthyHttpCodes` to include 426 for WebSocket endpoints
3. **Grace period matters:** Give containers time to start before health checks begin
4. **Error suppression:** Filter expected errors to keep logs clean

## Next Steps

- ✅ Service is stable and ready for production traffic
- ⏳ Deploy updated Python agent to suppress health check error logs (optional)
- ⏳ Monitor CloudWatch metrics for performance
- ⏳ Test canary Lambda against ECS endpoint
