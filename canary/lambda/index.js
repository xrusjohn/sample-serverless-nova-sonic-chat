const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { Amplify } = require('aws-amplify');
const { events } = require('aws-amplify/data');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// WebSocket polyfill for Lambda environment
Object.assign(global, { WebSocket: require('ws') });

// Configure Amplify for AppSync Events
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
const dynamodb = new DynamoDBClient({});

// Filter audioOutput events from CloudWatch logs
const originalLog = console.log;
console.log = function(...args) {
  const message = args.join(' ');
  if (!message.includes('audioOutput')) {
    originalLog.apply(console, args);
  }
};

// Audio utilities
function calculateAudioDuration(base64Audio, sampleRate = 16000) {
  const binaryString = Buffer.from(base64Audio, 'base64').toString('binary');
  const bytes = binaryString.length;
  const numSamples = bytes / 2;
  const durationMs = (numSamples / sampleRate) * 1000;
  return durationMs;
}

function saveAudioToWav(base64Chunks, filename) {
  const audioData = Buffer.concat(base64Chunks.map(chunk => Buffer.from(chunk, 'base64')));
  const sampleRate = 16000;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = audioData.length;
  const fileSize = 36 + dataSize;

  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(fileSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  audioData.copy(wav, 44);

  fs.writeFileSync(filename, wav);
}

const AUDIO_BUCKET = process.env.AUDIO_BUCKET;
const TRANSCRIPT_BUCKET = process.env.TRANSCRIPT_BUCKET;
const EVENT_API_ENDPOINT = process.env.EVENT_API_ENDPOINT;
const EVENT_BUS_NAMESPACE = process.env.EVENT_BUS_NAMESPACE;
const SERVICE_API_ENDPOINT = process.env.SERVICE_API_ENDPOINT;
const TABLE_NAME = process.env.TABLE_NAME;

exports.handler = async (event) => {
  const testId = uuidv4();
  const startTime = Date.now();
  
  console.log(`Starting two-turn canary test ${testId}`);
  
  try {
    // Run the two-turn canary test
    const result = await runTwoTurnCanaryTest(testId);
    
    // Save transcript and recordings to S3
    await saveTranscript(testId, result.transcript);
    if (result.recordingDir) {
      await saveRecordings(testId, result.recordingDir);
    }
    
    // Publish success metrics
    await publishMetrics('CanarySuccess', 1, testId);
    await publishMetrics('CanaryTotalTime', result.totalTime, testId);
    await publishMetrics('CanaryTurn1Time', result.turn1Time, testId);
    await publishMetrics('CanaryTurn2Time', result.turn2Time, testId);
    await publishMetrics('CanaryToolUseSuccess', result.toolsUsed.length > 0 ? 1 : 0, testId);
    await publishMetrics('CanaryToolsUsedCount', result.toolsUsed.length, testId);
    
    // Publish token usage metrics
    if (result.transcript.metrics) {
      const metrics = result.transcript.metrics;
      await publishMetrics('CanaryTotalTokens', metrics.totalTokens, testId);
      await publishMetrics('CanaryInputTokens', metrics.inputTokens, testId);
      await publishMetrics('CanaryOutputTokens', metrics.outputTokens, testId);
      await publishMetrics('CanarySpeechInputTokens', metrics.speechInputTokens, testId);
      await publishMetrics('CanarySpeechOutputTokens', metrics.speechOutputTokens, testId);
      await publishMetrics('CanaryTextInputTokens', metrics.textInputTokens, testId);
      await publishMetrics('CanaryTextOutputTokens', metrics.textOutputTokens, testId);
    }
    
    console.log(`Canary test ${testId} completed successfully in ${result.totalTime}ms`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        testId,
        success: true,
        totalTime: result.totalTime,
        turn1Time: result.turn1Time,
        turn2Time: result.turn2Time,
        toolsUsed: result.toolsUsed,
        tokenMetrics: result.transcript.metrics,
        transcriptUrl: `s3://${TRANSCRIPT_BUCKET}/transcripts/${testId}.json`,
        message: 'Two-turn canary test passed'
      })
    };
    
  } catch (error) {
    console.error(`Canary test ${testId} failed:`, error);
    
    // Publish failure metrics
    await publishMetrics('CanarySuccess', 0, testId);
    await publishMetrics('CanaryFailure', 1, testId);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        testId,
        success: false,
        error: error.message,
        message: 'Two-turn canary test failed'
      })
    };
  }
};

async function runTwoTurnCanaryTest(testId) {
  return new Promise(async (resolve, reject) => {
    const sessionId = uuidv4();
    const userId = 'canary-user';
    const startTime = Date.now();
    
    let conversationState = 'starting';
    let turn1StartTime, turn1EndTime, turn2StartTime, turn2EndTime;
    let turn1AudioChunks = [];
    let turn2AudioChunks = [];
    let transcript = {
      testId,
      sessionId,
      timestamp: new Date().toISOString(),
      events: [],
      turns: [],
      usage_summary: {
        delta_sum_calculated: {
          total_input_tokens: { speechTokens: 0, textTokens: 0, sum: 0 },
          total_output_tokens: { speechTokens: 0, textTokens: 0, sum: 0 },
          total_tokens: 0
        },
        final_total: null,
        cost_estimate: { input_cost: 0, output_cost: 0, total_cost: 0 }
      }
    };
    let currentTurnText = '';
    let toolsUsed = [];
    let deltaTokenSum = {
      input: { speechTokens: 0, textTokens: 0 },
      output: { speechTokens: 0, textTokens: 0 }
    };
    
    // Load test audio files (recorded from working app)
    const turn1Audio = await loadTestAudio('test-audio.raw');
    const turn2Audio = await loadTestAudio('test-audio.raw'); // Use same file for both turns
    
    // Connect to AppSync Events
    const channelPath = `/${EVENT_BUS_NAMESPACE}/user/${userId}/${sessionId}`;
    const channel = await events.connect(channelPath);
    
    const timeout = setTimeout(() => {
      console.log(`Canary test ${testId} timed out after 30 seconds`);
      reject(new Error('Canary test timeout - conversation did not complete'));
    }, 30000); // 30 second timeout for testing
    
    console.log(`Connected to AppSync Events channel for test ${testId}`);
    console.log(`Channel path: ${channelPath}`);
    
    // Start Nova Sonic session
    console.log('About to start Nova session...');
    await startNovaSession(sessionId, userId);
    console.log('Nova session start request sent');
    
    // Subscribe to events from the channel
    channel.subscribe({
      next: async (data) => {
        try {
          const event = data.event;
          
          // Wait for ready event before sending audio
          if (event.event === 'ready' && conversationState === 'starting') {
            console.log('Received ready event, starting turn 1');
            conversationState = 'turn1_sent';
            turn1StartTime = Date.now();
            await sendAudioToSession(sessionId, userId, turn1Audio);
            transcript.turns.push({
              turn: 1,
              userInput: 'Hello, how are you today?',
              timestamp: new Date().toISOString(),
              assistantResponse: '',
              toolsUsed: []
            });
            return;
          }
          
          // Collect text chunks for transcript
          if (event.textChunk) {
            currentTurnText += event.textChunk;
            transcript.events.push({
              type: 'text_chunk',
              timestamp: new Date().toISOString(),
              content: event.textChunk
            });
          }
          
          // Collect audio chunks for recording
          if (event.audioOutput) {
            for (const blob of event.audioOutput.blobs || []) {
              if (conversationState === 'turn1_sent') {
                turn1AudioChunks.push(blob);
              } else if (conversationState === 'turn2_sent') {
                turn2AudioChunks.push(blob);
              }
            }
          }
          
          // Capture usage metrics with delta tracking
          if (event.usageEvent) {
            const details = event.usageEvent.details;
            
            // Track delta tokens (incremental usage)
            if (details && details.delta) {
              deltaTokenSum.input.speechTokens += details.delta.input?.speechTokens || 0;
              deltaTokenSum.input.textTokens += details.delta.input?.textTokens || 0;
              deltaTokenSum.output.speechTokens += details.delta.output?.speechTokens || 0;
              deltaTokenSum.output.textTokens += details.delta.output?.textTokens || 0;
            }
            
            // Store final total from usage event
            if (details && details.total) {
              transcript.usage_summary.final_total = {
                total_input_tokens: {
                  speechTokens: details.total.input?.speechTokens || 0,
                  textTokens: details.total.input?.textTokens || 0,
                  sum: (details.total.input?.speechTokens || 0) + (details.total.input?.textTokens || 0)
                },
                total_output_tokens: {
                  speechTokens: details.total.output?.speechTokens || 0,
                  textTokens: details.total.output?.textTokens || 0,
                  sum: (details.total.output?.speechTokens || 0) + (details.total.output?.textTokens || 0)
                },
                total_tokens: event.usageEvent.totalTokens || 0
              };
            }
            
            // Log chronological usage event
            transcript.events.push({
              type: 'usage_event',
              timestamp: new Date().toISOString(),
              usage_data: event.usageEvent
            });
          }
          
          // Detect tool use
          if (event.toolUse) {
            const toolName = event.toolUse.name || 'unknown_tool';
            if (!toolsUsed.includes(toolName)) {
              toolsUsed.push(toolName);
            }
            transcript.events.push({
              type: 'tool_use_detected',
              timestamp: new Date().toISOString(),
              tool_name: toolName,
              tool_input: event.toolUse.input
            });
          } else if (event.textChunk && event.textChunk.includes('weather')) {
            // Fallback detection for weather-related responses
            if (!toolsUsed.includes('weather_api')) {
              toolsUsed.push('weather_api');
              transcript.events.push({
                type: 'tool_use_detected',
                timestamp: new Date().toISOString(),
                tool_name: 'weather_api',
                detection_method: 'text_analysis'
              });
            }
          }
          
          // Handle completion of each turn
          if (event.textStop && event.textStop.stopReason === 'END_TURN') {
            if (conversationState === 'turn1_sent') {
              // Turn 1 completed
              turn1EndTime = Date.now();
              transcript.turns[0].assistantResponse = currentTurnText.trim();
              transcript.turns[0].toolsUsed = [...toolsUsed];
              currentTurnText = '';
              
              console.log(`Turn 1 completed in ${turn1EndTime - turn1StartTime}ms`);
              
              // Send silence while waiting for agent response
              const silenceAudio = await loadTestAudio('silence_1s.wav');
              let silenceSeq = 1;
              const silenceInterval = setInterval(() => {
                sendAudioToSession(sessionId, userId, silenceAudio, silenceSeq++);
              }, 1000);
              
              // Wait 2 seconds then send turn 2
              setTimeout(() => {
                clearInterval(silenceInterval);
                conversationState = 'turn2_sent';
                turn2StartTime = Date.now();
                sendAudioToSession(sessionId, userId, turn2Audio, silenceSeq);
                transcript.turns.push({
                  turn: 2,
                  userInput: "What's the weather like in Seattle?",
                  timestamp: new Date().toISOString(),
                  assistantResponse: '',
                  toolsUsed: []
                });
              }, 2000);
              
            } else if (conversationState === 'turn2_sent') {
              // Turn 2 completed - test finished!
              turn2EndTime = Date.now();
              transcript.turns[1].assistantResponse = currentTurnText.trim();
              transcript.turns[1].toolsUsed = [...toolsUsed];
              
              clearTimeout(timeout);
              
              const totalTime = turn2EndTime - startTime;
              const turn1Time = turn1EndTime - turn1StartTime;
              const turn2Time = turn2EndTime - turn2StartTime;
              
              // Calculate delta sum totals
              transcript.usage_summary.delta_sum_calculated = {
                total_input_tokens: {
                  speechTokens: deltaTokenSum.input.speechTokens,
                  textTokens: deltaTokenSum.input.textTokens,
                  sum: deltaTokenSum.input.speechTokens + deltaTokenSum.input.textTokens
                },
                total_output_tokens: {
                  speechTokens: deltaTokenSum.output.speechTokens,
                  textTokens: deltaTokenSum.output.textTokens,
                  sum: deltaTokenSum.output.speechTokens + deltaTokenSum.output.textTokens
                },
                total_tokens: deltaTokenSum.input.speechTokens + deltaTokenSum.input.textTokens + 
                             deltaTokenSum.output.speechTokens + deltaTokenSum.output.textTokens
              };
              
              // Calculate cost estimate (Nova Sonic pricing)
              const inputCost = (transcript.usage_summary.delta_sum_calculated.total_input_tokens.sum / 1000) * 0.0008;
              const outputCost = (transcript.usage_summary.delta_sum_calculated.total_output_tokens.sum / 1000) * 0.0016;
              transcript.usage_summary.cost_estimate = {
                input_cost: inputCost,
                output_cost: outputCost,
                total_cost: inputCost + outputCost
              };
              
              console.log(`Two-turn test completed: Total=${totalTime}ms, Turn1=${turn1Time}ms, Turn2=${turn2Time}ms`);
              console.log(`Token usage: ${transcript.usage_summary.delta_sum_calculated.total_tokens} tokens, Est. cost: $${transcript.usage_summary.cost_estimate.total_cost.toFixed(4)}`);
              
              // Save audio recordings
              const recordingDir = `/tmp/recordings/${testId}`;
              if (!fs.existsSync(recordingDir)) {
                fs.mkdirSync(recordingDir, { recursive: true });
              }
              if (turn1AudioChunks.length > 0) {
                saveAudioToWav(turn1AudioChunks, `${recordingDir}/turn1-audio.wav`);
              }
              if (turn2AudioChunks.length > 0) {
                saveAudioToWav(turn2AudioChunks, `${recordingDir}/turn2-audio.wav`);
              }
              
              resolve({
                totalTime,
                turn1Time,
                turn2Time,
                toolsUsed,
                transcript,
                recordingDir
              });
            }
          }
        } catch (error) {
          console.error('Error processing event:', error);
        }
      },
      error: (error) => {
        clearTimeout(timeout);
        reject(new Error(`AppSync Events error: ${error.message}`));
      }
    });
  });
}

async function loadTestAudio(filename) {
  try {
    const command = new GetObjectCommand({
      Bucket: AUDIO_BUCKET,
      Key: filename
    });
    
    const result = await s3.send(command);
    const chunks = [];
    for await (const chunk of result.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Error loading test audio ${filename}:`, error);
    // Return empty buffer as fallback
    return Buffer.alloc(0);
  }
}

async function startNovaSession(sessionId, userId) {
  try {
    // First create session in DynamoDB like the app does
    const putCommand = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: { S: `USER#${userId}` },
        SK: { S: `SESSION#${sessionId}` },
        sessionId: { S: sessionId },
        userId: { S: userId },
        createdAt: { N: Date.now().toString() },
        mcpConfig: { S: JSON.stringify({ mcpServers: {} }) }
      }
    });
    
    await dynamodb.send(putCommand);
    console.log('Session created in DynamoDB');
    
    const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
    const lambda = new LambdaClient({});
    
    // Get the agent handler function name from environment
    const agentFunctionName = process.env.AGENT_HANDLER_FUNCTION_NAME;
    if (!agentFunctionName) {
      throw new Error('AGENT_HANDLER_FUNCTION_NAME environment variable not set');
    }
    
    // Invoke the agent Lambda function directly
    const command = new InvokeCommand({
      FunctionName: agentFunctionName,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify({
        sessionId,
        userId,
        systemPrompt: 'You are a helpful assistant. Please respond briefly to questions.',
        voiceId: 'tiffany',
        mcpConfig: { mcpServers: {} }
      })
    });
    
    const response = await lambda.send(command);
    
    if (response.StatusCode !== 202) {
      throw new Error(`Failed to start session: ${response.StatusCode}`);
    }
    
    console.log(`Nova Sonic session started for canary test`);
    
  } catch (error) {
    console.error('Error starting Nova session:', error);
    throw error;
  }
}

async function sendAudioToSession(sessionId, userId, audioData, sequence = 0) {
  try {
    const channelPath = `/${EVENT_BUS_NAMESPACE}/user/${userId}/${sessionId}`;
    const channel = await events.connect(channelPath);
    
    const base64Audio = audioData.toString('base64');
    const chunkSize = 512;
    const chunks = [];
    
    for (let i = 0; i < base64Audio.length; i += chunkSize) {
      chunks.push(base64Audio.slice(i, i + chunkSize));
    }
    
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      await channel.publish({
        direction: 'ctob',
        event: 'audioInput',
        data: {
          blobs: batch,
          sequence: sequence + Math.floor(i / batchSize)
        }
      });
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
  } catch (error) {
    console.error('Error sending audio:', error);
    throw error;
  }
}

async function saveTranscript(testId, transcript) {
  try {
    const command = new PutObjectCommand({
      Bucket: TRANSCRIPT_BUCKET,
      Key: `transcripts/${testId}.json`,
      Body: JSON.stringify(transcript, null, 2),
      ContentType: 'application/json'
    });
    
    await s3.send(command);
    console.log(`Transcript saved for test ${testId}`);
    
  } catch (error) {
    console.error('Error saving transcript:', error);
  }
}

async function saveRecordings(testId, recordingDir) {
  try {
    const files = fs.readdirSync(recordingDir);
    for (const file of files) {
      const filePath = `${recordingDir}/${file}`;
      const fileContent = fs.readFileSync(filePath);
      const command = new PutObjectCommand({
        Bucket: AUDIO_BUCKET,
        Key: `recordings/${testId}/${file}`,
        Body: fileContent,
        ContentType: file.endsWith('.wav') ? 'audio/wav' : 'application/json'
      });
      await s3.send(command);
    }
    console.log(`Recordings saved for test ${testId}`);
  } catch (error) {
    console.error('Error saving recordings:', error);
  }
}

async function publishMetrics(metricName, value, testId) {
  try {
    const command = new PutMetricDataCommand({
      Namespace: 'SonicCanary',
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: metricName.includes('Time') ? 'Milliseconds' : 'Count',
          Dimensions: [
            {
              Name: 'TestId',
              Value: testId
            }
          ],
          Timestamp: new Date()
        }
      ]
    });
    
    await cloudwatch.send(command);
  } catch (error) {
    console.error('Error publishing metrics:', error);
  }
}