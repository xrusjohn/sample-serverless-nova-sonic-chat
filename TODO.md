# TODO

## Agent Lambda Reliability Improvements

### Fix 'ready' Event Timing
The agent Lambda should only send the 'ready' event after full initialization, not just startup:

```javascript
// Current: Sends 'ready' too early
// Better approach:
try {
  // 1. Load and validate session from DynamoDB
  const session = await sessionRepository.getSession(userId, sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  // 2. Initialize Nova Sonic client
  const novaClient = await initializeNovaClient(session);
  
  // 3. Set up AppSync Events connection
  const eventsChannel = await setupEventsChannel(sessionId, userId);
  
  // 4. NOW we're actually ready
  await eventsChannel.publish({ event: 'ready', direction: 'btoc' });
  
} catch (error) {
  // Send error event instead of ready
  await eventsChannel.publish({ 
    event: 'error', 
    direction: 'btoc', 
    data: { message: error.message } 
  });
}
```

**Benefits:**
- Prevents canary timeouts when session doesn't exist
- Makes 'ready' event a true signal of readiness
- Provides error feedback instead of silent failures
- More robust system overall