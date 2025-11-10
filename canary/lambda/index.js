const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { Amplify } = require('aws-amplify');
const { events } = require('aws-amplify/data');
const { v4: uuidv4 } = require('uuid');

// WebSocket polyfill
Object.assign(global, { WebSocket: require('ws') });

// Configure Amplify
Amplify.configure(
  {
    API: {
      Events: {
        endpoint: `${process.env.EVENT_API_ENDPOINT}/event`,
        region: process.env.AWS_REGION || 'us-east-1',
        defaultAuthMode: 'iam',
      },
    },
  },
  {
    Auth: {
      credentialsProvider: {
        getCredentialsAndIdentityId: async () => {
          const provider = fromNodeProviderChain();
          const credentials = await provider();
          return { credentials };
        },
        clearCredentialsAndIdentityId: async () => {},
      },
    },
  }
);

const s3 = new S3Client({});
const cloudwatch = new CloudWatchClient({});
const lambda = new LambdaClient({});

async function loadAudioFromS3(filename) {
  const result = await s3.send(new GetObjectCommand({
    Bucket: process.env.AUDIO_BUCKET,
    Key: filename
  }));
  const chunks = [];
  for await (const chunk of result.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const base64Audio = buffer.toString('base64');
  const chunkSize = 4096;
  const audioChunks = [];
  for (let i = 0; i < base64Audio.length; i += chunkSize) {
    audioChunks.push(base64Audio.slice(i, i + chunkSize));
  }
  return audioChunks;
}

async function publishMetrics(metricName, value, testId) {
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'SonicCanary',
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Unit: metricName.includes('Time') ? 'Milliseconds' : 'Count',
        Dimensions: [{ Name: 'TestId', Value: testId }],
        Timestamp: new Date()
      },
      {
        MetricName: metricName,
        Value: value,
        Unit: metricName.includes('Time') ? 'Milliseconds' : 'Count',
        Timestamp: new Date()
      }
    ]
  }));
}

exports.handler = async () => {
  const testId = uuidv4();
  const sessionId = uuidv4();
  const userId = 'canary-user';
  const startTime = Date.now();
  console.log(`[${testId}] Test started`);

  try {
    const t1 = Date.now();
    const audioChunks1 = await loadAudioFromS3(process.env.TURN1_AUDIO_FILE || 'hi.wav');
    const audioChunks2 = await loadAudioFromS3(process.env.TURN2_AUDIO_FILE || 'good_morning_nova.wav');
    const audioLoadTime = Date.now() - t1;
    console.log(`[${testId}] Audio loaded: ${audioLoadTime}ms`);

    const t2 = Date.now();
    const channelPath = `/${process.env.EVENT_BUS_NAMESPACE}/user/${userId}/${sessionId}`;
    const channel = await events.connect(channelPath);
    const channelConnectTime = Date.now() - t2;
    console.log(`[${testId}] Channel connected: ${channelConnectTime}ms`);

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 60000);
      
      let state = 'starting';
      let turn1Start, turn1End, turn2Start, turn2End;
      let turn1Text = '', turn2Text = '';
      let agentInvokeTime, readyWaitTime;
      let turn2AudioDuration = 0;

      channel.subscribe({
        next: async (data) => {
          const event = data.event;

          if (event.event === 'ready' && state === 'starting') {
            readyWaitTime = Date.now() - startTime;
            console.log(`[${testId}] Ready received: ${readyWaitTime}ms`);
            state = 'turn1';
            turn1Start = Date.now();
            channel.publish({ direction: 'ctob', event: 'audioInput', data: { blobs: audioChunks1, sequence: 0 } });
            console.log(`[${testId}] Turn 1 audio sent`);
            setTimeout(() => reject(new Error('Turn 1 timeout')), 30000);
          }

          if (event.event === 'textOutput' && event.data?.role === 'assistant') {
            if (state === 'turn1') turn1Text += event.data.content;
            if (state === 'turn2') turn2Text += event.data.content;
          }

          if (event.event === 'audioOutput' && state === 'turn2') {
            // Calculate audio duration (24kHz, 16-bit, mono)
            for (const blob of event.data?.blobs || []) {
              const bytes = Buffer.from(blob, 'base64').length;
              const samples = bytes / 2;
              const durationMs = (samples / 24000) * 1000;
              turn2AudioDuration += durationMs;
            }
          }

          if (event.event === 'audioStop') {
            if (state === 'turn1') {
              turn1End = Date.now();
              console.log(`[${testId}] Turn 1 complete: ${turn1End - turn1Start}ms`);
              state = 'turn1_complete';
              setTimeout(() => {
                state = 'turn2';
                turn2Start = Date.now();
                channel.publish({ direction: 'ctob', event: 'audioInput', data: { blobs: audioChunks2, sequence: 1 } });
                console.log(`[${testId}] Turn 2 audio sent`);
              }, 2000);
            } else if (state === 'turn2') {
              turn2End = Date.now();
              console.log(`[${testId}] Turn 2 complete: ${turn2End - turn2Start}ms`);
              clearTimeout(timeout);
              
              // Wait for audio to finish, then terminate
              const waitTime = Math.max(turn2AudioDuration, 1000);
              console.log(`[${testId}] Waiting ${waitTime.toFixed(0)}ms for audio to finish`);
              setTimeout(() => {
                channel.publish({ direction: 'ctob', event: 'terminateSession', data: {} });
              }, waitTime);
              
              const result = {
                totalTime: turn2End - startTime,
                turn1Time: turn1End - turn1Start,
                turn2Time: turn2End - turn2Start,
                turn1Text,
                turn2Text,
                audioLoadTime,
                channelConnectTime,
                agentInvokeTime,
                readyWaitTime
              };
              console.log(`[${testId}] Test complete: total=${result.totalTime}ms, turn1=${result.turn1Time}ms, turn2=${result.turn2Time}ms`);
              resolve(result);
            }
          }
        },
        error: reject
      });

      // Start agent
      const t3 = Date.now();
      lambda.send(new InvokeCommand({
        FunctionName: process.env.AGENT_HANDLER_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: JSON.stringify({
          sessionId, userId,
          systemPrompt: 'You are a helpful assistant. Please respond briefly.',
          voiceId: 'tiffany',
          mcpConfig: { mcpServers: {} }
        })
      })).then(() => {
        agentInvokeTime = Date.now() - t3;
        console.log(`[${testId}] Agent invoked: ${agentInvokeTime}ms`);
      });
    });

    await publishMetrics('CanarySuccess', 1, testId);
    await publishMetrics('CanaryTotalTime', result.totalTime, testId);
    await publishMetrics('CanaryTurn1Time', result.turn1Time, testId);
    await publishMetrics('CanaryTurn2Time', result.turn2Time, testId);
    await publishMetrics('CanaryAudioLoadTime', result.audioLoadTime, testId);
    await publishMetrics('CanaryChannelConnectTime', result.channelConnectTime, testId);
    await publishMetrics('CanaryAgentInvokeTime', result.agentInvokeTime, testId);
    await publishMetrics('CanaryReadyWaitTime', result.readyWaitTime, testId);

    return {
      statusCode: 200,
      body: JSON.stringify({ testId, success: true, ...result })
    };
  } catch (error) {
    await publishMetrics('CanarySuccess', 0, testId);
    return {
      statusCode: 500,
      body: JSON.stringify({ testId, success: false, error: error.message })
    };
  }
};
