const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const cloudwatch = new CloudWatchClient({});
const s3 = new S3Client({});
const lambda = new LambdaClient({});

async function publishMetrics(metricName, value, testId) {
  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'SonicCanary',
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: metricName.includes('Time') ? 'Milliseconds' : 'Count',
          Timestamp: new Date()
        }
      ]
    }));
    console.log(`✓ Published ${metricName}=${value}`);
  } catch (error) {
    console.error(`❌ Error publishing ${metricName}:`, error.message);
  }
}

async function runTwoTurnConversation({ channel, audioChunks1, audioChunks2, testId, sessionId, startTime }) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Overall timeout')), 60000);
    let responseTimeout;
    
    let state = 'starting';
    let turn1Start, turn1End, turn2Start, turn2End;
    let turn1Text = '', turn2Text = '';
    let readyWaitTime;
    let turn1AudioDuration = 0;
    let turn2AudioDuration = 0;

    channel.subscribe({
      next: async (data) => {
        const event = data.event;

        if (event.event === 'error') {
          console.error(`[${testId}] Error event received:`, event.data?.message);
          clearTimeout(timeout);
          clearTimeout(responseTimeout);
          reject(new Error(`Agent error: ${event.data?.message || 'Unknown error'}`));
          return;
        }

        if (event.event === 'ready' && state === 'starting') {
          readyWaitTime = Date.now() - startTime;
          console.log(`[${testId}] Ready received: ${readyWaitTime}ms`);
          state = 'turn1';
          turn1Start = Date.now();
          channel.publish({ direction: 'ctob', event: 'audioInput', data: { blobs: audioChunks1, sequence: 0 } });
          console.log(`[${testId}] Turn 1 audio sent`);
          responseTimeout = setTimeout(() => reject(new Error('Turn 1 timeout')), 30000);
        }

        if (event.event === 'textOutput' && event.data?.role === 'assistant') {
          if (state === 'turn1') turn1Text += event.data.content;
          if (state === 'turn2') turn2Text += event.data.content;
        }

        if (event.event === 'audioOutput') {
          for (const blob of event.data?.blobs || []) {
            const bytes = Buffer.from(blob, 'base64').length;
            const samples = bytes / 2;
            const durationMs = (samples / 24000) * 1000;
            if (state === 'turn1') turn1AudioDuration += durationMs;
            if (state === 'turn2') turn2AudioDuration += durationMs;
          }
        }

        if (event.event === 'audioStop') {
          if (state === 'turn1') {
            console.log(`[${testId}] audioStop received, state=${state}`);
            turn1End = Date.now();
            console.log(`[${testId}] Turn 1 complete: ${turn1End - turn1Start}ms, audio: ${turn1AudioDuration.toFixed(0)}ms`);
            clearTimeout(responseTimeout);
            setTimeout(() => {
              state = 'turn2';
              turn2Start = Date.now();
              channel.publish({ direction: 'ctob', event: 'audioInput', data: { blobs: audioChunks2, sequence: 1 } });
              console.log(`[${testId}] Turn 2 audio sent`);
              // Give Bedrock time to process audio before signaling end
              setTimeout(() => {
                channel.publish({ direction: 'ctob', event: 'endAudioInput', data: {} });
                console.log(`[${testId}] endAudioInput sent`);
              }, 2000); // Wait 2s for Bedrock to process
              responseTimeout = setTimeout(() => reject(new Error('Turn 2 timeout')), 30000);
            }, 2000);
          } else if (state === 'turn2') {
            turn2End = Date.now();
            console.log(`[${testId}] Turn 2 complete: ${turn2End - turn2Start}ms`);
            clearTimeout(timeout);
            clearTimeout(responseTimeout);
            
            // Terminate immediately after audioStop to prevent empty content creation
            console.log(`[${testId}] Sending terminateSession`);
            channel.publish({ direction: 'ctob', event: 'terminateSession', data: {} });
            
            const result = {
              totalTime: Date.now() - startTime,
              turn1Time: turn1End - turn1Start,
              turn2Time: turn2End - turn2Start,
              turn1Text,
              turn2Text,
              readyWaitTime
            };
            console.log(`[${testId}] Test complete: total=${result.totalTime}ms, turn1=${result.turn1Time}ms, turn2=${result.turn2Time}ms`);
            resolve(result);
          }
        }
      },
      error: reject
    });
  });
}

async function runTwoTurnCanary({ events, audioChunks1, audioChunks2, testId, sessionId, userId, namespace, agentFunctionName }) {
  const startTime = Date.now();
  
  console.log(`[${testId}] Starting canary test`);
  
  const t1 = Date.now();
  const channelPath = `/${namespace}/user/${userId}/${sessionId}`;
  const channel = await events.connect(channelPath);
  const channelConnectTime = Date.now() - t1;
  console.log(`[${testId}] Channel connected: ${channelConnectTime}ms`);

  const t2 = Date.now();
  await lambda.send(new InvokeCommand({
    FunctionName: agentFunctionName,
    InvocationType: 'Event',
    Payload: JSON.stringify({
      sessionId,
      userId,
      systemPrompt: 'You are a helpful assistant. Please respond briefly.',
      voiceId: 'tiffany',
      mcpConfig: { mcpServers: {} }
    })
  }));
  const agentInvokeTime = Date.now() - t2;
  console.log(`[${testId}] Agent invoked: ${agentInvokeTime}ms`);

  const result = await runTwoTurnConversation({
    channel,
    audioChunks1,
    audioChunks2,
    testId,
    sessionId,
    startTime
  });

  result.channelConnectTime = channelConnectTime;
  result.agentInvokeTime = agentInvokeTime;

  return result;
}

async function saveTranscriptToS3(testId, transcript) {
  const bucket = process.env.TRANSCRIPT_BUCKET;
  if (!bucket) {
    console.log(`⚠️  TRANSCRIPT_BUCKET not set, S3 upload skipped`);
    return;
  }
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `transcripts/${testId}.json`,
      Body: JSON.stringify(transcript, null, 2),
      ContentType: 'application/json'
    }));
    console.log(`💾 Transcript saved to S3: s3://${bucket}/transcripts/${testId}.json`);
  } catch (error) {
    console.error('Error saving transcript to S3:', error);
  }
}

module.exports = {
  publishMetrics,
  runTwoTurnCanary,
  saveTranscriptToS3
};
