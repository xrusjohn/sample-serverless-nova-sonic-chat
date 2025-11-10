const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { Amplify } = require('aws-amplify');
const { events } = require('aws-amplify/data');
const { v4: uuidv4 } = require('uuid');
const { publishMetrics, runTwoTurnCanary } = require('sonic-canary-shared');

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

exports.handler = async () => {
  const testId = uuidv4();
  const sessionId = uuidv4();
  const userId = 'canary-user';
  console.log(`[${testId}] Test started`);

  try {
    const t1 = Date.now();
    const audioChunks1 = await loadAudioFromS3(process.env.TURN1_AUDIO_FILE || 'hi.wav');
    const audioChunks2 = await loadAudioFromS3(process.env.TURN2_AUDIO_FILE || 'good_morning_nova.wav');
    const audioLoadTime = Date.now() - t1;
    console.log(`[${testId}] Audio loaded: ${audioLoadTime}ms`);

    const result = await runTwoTurnCanary({
      events,
      audioChunks1,
      audioChunks2,
      testId,
      sessionId,
      userId,
      namespace: process.env.EVENT_BUS_NAMESPACE,
      agentFunctionName: process.env.AGENT_HANDLER_FUNCTION_NAME
    });
    
    result.audioLoadTime = audioLoadTime;

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
    await publishMetrics('CanaryFailure', 1, testId);
    return {
      statusCode: 500,
      body: JSON.stringify({ testId, success: false, error: error.message })
    };
  }
};
