#!/usr/bin/env node

require('dotenv').config();

const { events } = require('aws-amplify/data');
const { Amplify } = require('aws-amplify');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { saveAudioToWav } = require('./audio-utils');

const s3 = new S3Client({});
const cloudwatch = new CloudWatchClient({});

// WebSocket polyfill
const ws = require('ws');
Object.assign(global, { WebSocket: ws });
ws.setMaxListeners(100);

const NAMESPACE = process.env.EVENT_BUS_NAMESPACE || 'default';
const EVENT_API_ENDPOINT = process.env.EVENT_API_ENDPOINT;

// Filter audioOutput events from CloudWatch logs
const originalLog = console.log;
console.log = function(...args) {
  const message = args.join(' ');
  if (!message.includes('audioOutput')) {
    originalLog.apply(console, args);
  }
};

// Configure Amplify for AppSync Events with IAM auth
Amplify.configure(
  {
    API: {
      Events: {
        endpoint: `${EVENT_API_ENDPOINT}/event`,
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

const arrayBufferToBase64 = (buffer) => {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return Buffer.from(binary.join(''), 'binary').toString('base64');
};

function loadAudioChunks(filePath) {
  const buffer = fs.readFileSync(filePath);
  const base64Audio = arrayBufferToBase64(buffer);
  const chunkSize = 512;
  const chunks = [];
  for (let i = 0; i < base64Audio.length; i += chunkSize) {
    chunks.push(base64Audio.slice(i, i + chunkSize));
  }
  return chunks;
}

function calculateAudioDuration(base64Audio, sampleRate = 16000) {
  const binaryString = Buffer.from(base64Audio, 'base64').toString('binary');
  const bytes = binaryString.length;
  const numSamples = bytes / 2;
  const durationMs = (numSamples / sampleRate) * 1000;
  return durationMs;
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

async function saveTranscriptToS3(testId, transcript) {
  const bucket = process.env.TRANSCRIPT_BUCKET;
  if (!bucket) {
    console.log(`⚠️  TRANSCRIPT_BUCKET not set, S3 upload skipped`);
    return;
  }
  
  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: `transcripts/${testId}.json`,
      Body: JSON.stringify(transcript, null, 2),
      ContentType: 'application/json'
    });
    await s3.send(command);
    console.log(`💾 Transcript saved to S3: s3://${bucket}/transcripts/${testId}.json`);
  } catch (error) {
    console.error('Error saving transcript to S3:', error);
  }
}

async function saveRecordingsToS3(testId, recordingDir) {
  try {
    const bucket = process.env.AUDIO_BUCKET;
    if (!bucket) return;
    
    const files = fs.readdirSync(recordingDir);
    for (const file of files) {
      const filePath = path.join(recordingDir, file);
      const fileContent = fs.readFileSync(filePath);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: `recordings/${testId}/${file}`,
        Body: fileContent,
        ContentType: file.endsWith('.wav') ? 'audio/wav' : 'application/json'
      });
      await s3.send(command);
    }
    console.log(`💾 Recordings saved to S3`);
  } catch (error) {
    console.error('Error saving recordings to S3:', error);
  }
}

async function sendAudio(channel, chunks, label, sequence) {
  console.log(`📤 Sending ${label} audio (${chunks.length} chunks)`);
  channel.publish({
    direction: 'ctob',
    event: 'audioInput',
    data: { blobs: chunks, sequence }
  });
  console.log(` ✓`);
}

async function runTwoTurnCanary() {
  const testId = uuidv4();
  const sessionId = uuidv4();
  const userId = 'canary-user';
  const startTime = Date.now();
  const recordingEvents = [];
  const turn1AudioChunks = [];
  const turn2AudioChunks = [];

  console.log(`\n🚀 Starting two-turn canary test: ${testId}`);
  console.log(`   Session: ${sessionId}`);
  console.log(`   User: ${userId}\n`);

  try {
    const audioFile1 = process.argv[2] || 'hi.raw';
    const audioFile2 = process.argv[3] || 'hi.raw';
    const audioPath1 = path.join(__dirname, '../audio', audioFile1);
    const audioPath2 = path.join(__dirname, '../audio', audioFile2);
    
    if (!fs.existsSync(audioPath1)) {
      throw new Error(`Test audio not found at ${audioPath1}`);
    }
    if (!fs.existsSync(audioPath2)) {
      throw new Error(`Test audio not found at ${audioPath2}`);
    }
    
    const audioChunks1 = loadAudioChunks(audioPath1);
    const audioChunks2 = loadAudioChunks(audioPath2);
    
    console.log(`✓ Loaded turn 1 audio: ${audioFile1} (${audioChunks1.length} chunks)`);
    console.log(`✓ Loaded turn 2 audio: ${audioFile2} (${audioChunks2.length} chunks)`);

    const channelPath = `/${NAMESPACE}/user/${userId}/${sessionId}`;
    console.log(`\n📡 Connecting to AppSync Events: ${channelPath}`);
    const channel = await events.connect(channelPath);
    console.log(`✓ Connected to AppSync Events`);

    console.log(`\n🤖 Starting Nova Sonic session...`);
    const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
    const lambda = new LambdaClient({});

    const agentFunctionName = process.env.AGENT_HANDLER_FUNCTION_NAME;
    if (!agentFunctionName) {
      throw new Error('AGENT_HANDLER_FUNCTION_NAME environment variable not set');
    }

    const invokeCommand = new InvokeCommand({
      FunctionName: agentFunctionName,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        sessionId,
        userId,
        systemPrompt: 'You are a helpful assistant. Please respond briefly.',
        voiceId: 'tiffany',
        mcpConfig: { mcpServers: {} }
      })
    });

    const response = await lambda.send(invokeCommand);
    if (response.StatusCode !== 202) {
      throw new Error(`Failed to start session: ${response.StatusCode}`);
    }
    console.log(`✓ Nova Sonic session started`);

    return new Promise((resolve, reject) => {
      let conversationState = 'starting';
      let turn1StartTime, turn1EndTime, turn2StartTime, turn2EndTime;
      let turn1UserInput = '';
      let turn1AssistantResponse = '';
      let turn2UserInput = '';
      let turn2AssistantResponse = '';
      let responseTimeout;
      let turn1InputAudioChunks = [];
      let turn2InputAudioChunks = [];
      let turn1AudioDuration = 0;
      let turn2AudioDuration = 0;
      let deltaTokenSum = {
        input: { speechTokens: 0, textTokens: 0 },
        output: { speechTokens: 0, textTokens: 0 }
      };
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

      const finishTest = async () => {
        clearTimeout(responseTimeout);
        const totalTime = Date.now() - startTime;
        const turn1Time = turn1EndTime - turn1StartTime;
        const turn2Time = turn2EndTime - turn2StartTime;

        // Finalize transcript
        transcript.turns = [
          {
            turn: 1,
            userInput: turn1UserInput,
            assistantResponse: turn1AssistantResponse,
            timestamp: new Date(turn1StartTime).toISOString()
          },
          {
            turn: 2,
            userInput: turn2UserInput,
            assistantResponse: turn2AssistantResponse,
            timestamp: new Date(turn2StartTime).toISOString()
          }
        ];
        
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
        
        const inputCost = (transcript.usage_summary.delta_sum_calculated.total_input_tokens.sum / 1000) * 0.0008;
        const outputCost = (transcript.usage_summary.delta_sum_calculated.total_output_tokens.sum / 1000) * 0.0016;
        transcript.usage_summary.cost_estimate = {
          input_cost: inputCost,
          output_cost: outputCost,
          total_cost: inputCost + outputCost
        };

        console.log(`\n✓ Test completed`);
        console.log(`\n📊 Results:`);
        console.log(`   Total time: ${totalTime}ms`);
        console.log(`   Turn 1 time: ${turn1Time}ms`);
        console.log(`   Turn 2 time: ${turn2Time}ms`);
        console.log(`   Turn 1 audio: ${turn1AudioDuration.toFixed(0)}ms`);
        console.log(`   Turn 2 audio: ${turn2AudioDuration.toFixed(0)}ms`);
        console.log(`   Tokens: ${transcript.usage_summary.delta_sum_calculated.total_tokens}`);
        console.log(`   Est. cost: $${transcript.usage_summary.cost_estimate.total_cost.toFixed(4)}`);
        console.log(`   Test ID: ${testId}`);
        console.log(`\n📝 Transcripts:`);
        console.log(`   Turn 1 input:  "${turn1UserInput}"`);
        console.log(`   Turn 1 output: "${turn1AssistantResponse}"`);
        console.log(`   Turn 2 input:  "${turn2UserInput}"`);
        console.log(`   Turn 2 output: "${turn2AssistantResponse}"`);

        // Save recordings locally with timestamp prefix
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const recordingDir = path.join(__dirname, `../recordings/${timestamp}-${testId}`);
        if (!fs.existsSync(recordingDir)) {
          fs.mkdirSync(recordingDir, { recursive: true });
        }
        
        if (turn1InputAudioChunks.length > 0) {
          try {
            saveAudioToWav(turn1InputAudioChunks, path.join(recordingDir, 'turn1-input.wav'));
            console.log(`\n💾 Turn 1 input audio saved (${turn1InputAudioChunks.length} chunks)`);
          } catch (err) {
            console.error(`❌ Failed to save turn1-input.wav: ${err.message}`);
          }
        } else {
          console.log(`\n⚠️  Turn 1 input audio NOT captured (${turn1InputAudioChunks.length} chunks)`);
        }
        if (turn1AudioChunks.length > 0) {
          try {
            saveAudioToWav(turn1AudioChunks, path.join(recordingDir, 'turn1-output.wav'));
            console.log(`💾 Turn 1 output audio saved (${turn1AudioChunks.length} chunks)`);
          } catch (err) {
            console.error(`❌ Failed to save turn1-output.wav: ${err.message}`);
          }
        } else {
          console.log(`⚠️  Turn 1 output audio NOT captured (${turn1AudioChunks.length} chunks)`);
        }
        if (turn2InputAudioChunks.length > 0) {
          try {
            saveAudioToWav(turn2InputAudioChunks, path.join(recordingDir, 'turn2-input.wav'));
            console.log(`💾 Turn 2 input audio saved (${turn2InputAudioChunks.length} chunks)`);
          } catch (err) {
            console.error(`❌ Failed to save turn2-input.wav: ${err.message}`);
          }
        } else {
          console.log(`⚠️  Turn 2 input audio NOT captured (${turn2InputAudioChunks.length} chunks)`);
        }
        if (turn2AudioChunks.length > 0) {
          try {
            saveAudioToWav(turn2AudioChunks, path.join(recordingDir, 'turn2-output.wav'));
            console.log(`💾 Turn 2 output audio saved (${turn2AudioChunks.length} chunks)`);
          } catch (err) {
            console.error(`❌ Failed to save turn2-output.wav: ${err.message}`);
          }
        } else {
          console.log(`⚠️  Turn 2 output audio NOT captured (${turn2AudioChunks.length} chunks)`);
        }
        
        fs.writeFileSync(path.join(recordingDir, 'events.json'), JSON.stringify({
          testId,
          sessionId,
          timestamp: new Date().toISOString(),
          events: recordingEvents
        }, null, 2));
        fs.writeFileSync(path.join(recordingDir, 'transcript.json'), JSON.stringify(transcript, null, 2));
        console.log(`💾 Event log saved`);
        console.log(`💾 Transcript saved`);
        console.log(`📁 Recording directory: ${recordingDir}`);
        
        // Publish metrics
        await publishMetrics('CanarySuccess', 1, testId);
        await publishMetrics('CanaryTotalTime', totalTime, testId);
        await publishMetrics('CanaryTurn1Time', turn1Time, testId);
        await publishMetrics('CanaryTurn2Time', turn2Time, testId);
        await publishMetrics('CanaryTotalTokens', transcript.usage_summary.delta_sum_calculated.total_tokens, testId);
        
        // Save transcript locally and to S3
        await saveTranscriptToS3(testId, transcript);
        if (process.env.AUDIO_BUCKET) {
          await saveRecordingsToS3(testId, recordingDir);
        }

        resolve({
          success: true,
          testId,
          totalTime,
          turn1Time,
          turn2Time,
          turn1UserInput,
          turn1AssistantResponse,
          turn2UserInput,
          turn2AssistantResponse,
          transcript
        });
      };

      channel.subscribe({
        next: async (data) => {
          try {
            const event = data.event;

            // Record all events (skip blobs for audioInput and audioOutput)
            if (event.event === 'audioInput' || event.event === 'audioOutput') {
              return;
            }
            recordingEvents.push({
              direction: event.direction,
              event: event.event,
              data: event.data
            });

            if (event.event === 'audioInput') {
              return;
            }

            if (event.event === 'ready' && conversationState === 'starting') {
              conversationState = 'turn1_sent';
              turn1StartTime = Date.now();
              console.log(`\n✓ Received 'ready' event`);

              turn1InputAudioChunks = [...audioChunks1];
              await sendAudio(channel, audioChunks1, 'turn 1', 0);
              
              responseTimeout = setTimeout(() => {
                reject(new Error('Canary test timeout - no response after 30 seconds'));
              }, 30000);
              return;
            }

            if (event.event === 'textOutput') {
              const role = event.data?.role;
              const content = event.data?.content || '';
              
              if (conversationState === 'turn1_sent') {
                if (role === 'user') {
                  turn1UserInput += content;
                  console.log(`[turn1 user] ${content}`);
                } else if (role === 'assistant') {
                  turn1AssistantResponse += content;
                }
              } else if (conversationState === 'turn2_sent') {
                if (role === 'user') {
                  turn2UserInput += content;
                  console.log(`[turn2 user] ${content}`);
                } else if (role === 'assistant') {
                  turn2AssistantResponse += content;
                }
              }
              
              process.stdout.write(content);
              transcript.events.push({
                type: 'text_chunk',
                timestamp: new Date().toISOString(),
                role,
                content
              });
            }

            if (event.event === 'usageEvent') {
              const details = event.data?.details;
              console.log(`[usageEvent] delta: ${JSON.stringify(details?.delta)}, total: ${JSON.stringify(details?.total)}`);
              if (details?.delta) {
                deltaTokenSum.input.speechTokens += details.delta.input?.speechTokens || 0;
                deltaTokenSum.input.textTokens += details.delta.input?.textTokens || 0;
                deltaTokenSum.output.speechTokens += details.delta.output?.speechTokens || 0;
                deltaTokenSum.output.textTokens += details.delta.output?.textTokens || 0;
              }
              if (details?.total) {
                transcript.usage_summary.final_total = {
                  total_input_tokens: {
                    speechTokens: details.total.input?.speechTokens || 0,
                    textTokens: details.total.input?.textTokens || 0
                  },
                  total_output_tokens: {
                    speechTokens: details.total.output?.speechTokens || 0,
                    textTokens: details.total.output?.textTokens || 0
                  }
                };
              }
              transcript.events.push({
                type: 'usage_event',
                timestamp: new Date().toISOString(),
                usage_data: event.data
              });
            }

            if (event.event === 'audioOutput') {
              let totalBytes = 0;
              for (const blob of event.data.blobs) {
                const bytes = Buffer.from(blob, 'base64').length;
                totalBytes += bytes;
                const duration = calculateAudioDuration(blob);
                if (conversationState === 'turn1_sent') {
                  turn1AudioDuration += duration;
                  turn1AudioChunks.push(blob);
                } else if (conversationState === 'turn2_sent') {
                  turn2AudioDuration += duration;
                  turn2AudioChunks.push(blob);
                }
              }
              transcript.events.push({
                type: 'audio_output',
                timestamp: new Date().toISOString(),
                chunk_count: event.data.blobs?.length || 0,
                total_bytes: totalBytes,
                duration_ms: conversationState === 'turn1_sent' ? turn1AudioDuration : turn2AudioDuration
              });
              recordingEvents.push({
                direction: event.direction,
                event: event.event,
                data: {
                  chunk_count: event.data.blobs?.length || 0,
                  total_bytes: totalBytes,
                  duration_ms: conversationState === 'turn1_sent' ? turn1AudioDuration : turn2AudioDuration
                }
              });
              return;
            }

            if (event.event === 'audioStop') {
              if (conversationState === 'turn1_sent') {
                turn1EndTime = Date.now();
                console.log(`\n✓ Turn 1 audio complete (${turn1AudioDuration.toFixed(0)}ms)`);
                clearTimeout(responseTimeout);
                conversationState = 'turn1_audio_complete';
                turn2StartTime = Date.now();

                // Send silence continuously while waiting for agent response
                let silenceSeq = 1;
                const silenceChunks = loadAudioChunks(path.join(__dirname, '../audio/silence_1s.wav'));
                const silenceInterval = setInterval(() => {
                  channel.publish({
                    direction: 'ctob',
                    event: 'audioInput',
                    data: { blobs: silenceChunks, sequence: silenceSeq++ }
                  });
                }, 1000);
                
                // Wait 2 seconds then send turn 2 audio
                setTimeout(async () => {
                  clearInterval(silenceInterval);
                  turn2InputAudioChunks = [...audioChunks2];
                  conversationState = 'turn2_sent';
                  await sendAudio(channel, audioChunks2, 'turn 2', silenceSeq);
                }, 2000);
                
                responseTimeout = setTimeout(() => {
                  reject(new Error('Canary test timeout - no response after 30 seconds'));
                }, 30000);
              } else if (conversationState === 'turn2_sent') {
                turn2EndTime = Date.now();
                console.log(`\n✓ Turn 2 audio complete (${turn2AudioDuration.toFixed(0)}ms)`);
                
                // Wait for audio duration + 3 second buffer before ending
                const delayMs = turn2AudioDuration + 3000;
                setTimeout(finishTest, delayMs);
              }
            }

            if (event.event === 'textStop' && conversationState === 'turn2_sent' && turn2EndTime === undefined) {
              turn2EndTime = Date.now();
              console.log(`[textStop] turn2UserInput so far: "${turn2UserInput}"`);
              transcript.events.push({
                type: 'text_stop',
                timestamp: new Date().toISOString(),
                stop_reason: event.data?.stopReason
              });
              setTimeout(finishTest, 3000);
            }

            if (event.event === 'end') {
              turn2EndTime = Date.now();
              finishTest();
            }
          } catch (error) {
            console.error('Error processing event:', error);
          }
        },
        error: (error) => {
          clearTimeout(responseTimeout);
          reject(new Error(`AppSync Events error: ${error?.message || 'unknown error'}`));
        }
      });
    });

  } catch (error) {
    console.error(`\n❌ Canary test failed: ${error.message}`);
    return {
      success: false,
      testId,
      error: error.message
    };
  }
}

runTwoTurnCanary().then(async result => {
  console.log(`\n${result.success ? '✅ PASS' : '❌ FAIL'}`);
  if (result.success) {
    await publishMetrics('CanarySuccess', 1, result.testId);
  } else {
    await publishMetrics('CanarySuccess', 0, result.testId);
  }
  process.exit(result.success ? 0 : 1);
}).catch(async error => {
  console.error('Fatal error:', error);
  await publishMetrics('CanarySuccess', 0, 'unknown');
  process.exit(1);
});
