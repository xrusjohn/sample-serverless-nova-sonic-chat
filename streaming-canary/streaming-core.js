const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Amplify } = require('aws-amplify');
const { events } = require('aws-amplify/data');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const fs = require('fs');
const path = require('path');

Object.assign(global, { WebSocket: require('ws') });

const AGENT_FUNCTION_NAME = 'ServerlessNovaSonicChatStack-AgentHandlerF75982B4-2QpEeKKhWJwV';

class StreamingCore {
  constructor(region = 'us-east-1') {
    this.lambda = new LambdaClient({ region });
    this.cloudwatch = new CloudWatchClient({ region });
    this.s3 = new S3Client({ region });
    
    Amplify.configure(
      {
        API: {
          Events: {
            endpoint: `${process.env.EVENT_API_ENDPOINT || 'https://6okdb2chbnetdmam3rgmbvmh6m.appsync-api.us-east-1.amazonaws.com'}/event`,
            region: 'us-east-1',
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
  }

  loadSilence() {
    const silencePath = path.join(__dirname, '../canary/audio/silence_1s.raw');
    if (fs.existsSync(silencePath)) {
      const silenceBuffer = fs.readFileSync(silencePath);
      const base64Silence = silenceBuffer.toString('base64');
      
      const chunkSize = 4096;
      const silenceChunks = [];
      for (let i = 0; i < base64Silence.length; i += chunkSize) {
        silenceChunks.push(base64Silence.slice(i, i + chunkSize));
      }
      return silenceChunks;
    }
    return [];
  }

  async publishMetrics(metricName, value, testId) {
    try {
      await this.cloudwatch.send(new PutMetricDataCommand({
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

  async loadAudioFile(filename) {
    // Try S3 first if bucket is configured
    if (process.env.AUDIO_BUCKET) {
      try {
        const result = await this.s3.send(new GetObjectCommand({
          Bucket: process.env.AUDIO_BUCKET,
          Key: filename
        }));
        
        const audioBuffer = Buffer.from(await result.Body.transformToByteArray());
        const base64Audio = audioBuffer.toString('base64');
        
        const chunkSize = 4096;
        const audioChunks = [];
        for (let i = 0; i < base64Audio.length; i += chunkSize) {
          audioChunks.push(base64Audio.slice(i, i + chunkSize));
        }
        
        return {
          name: filename,
          chunks: audioChunks,
          size: audioBuffer.length
        };
      } catch (error) {
        console.log(`⚠️  S3 load failed, trying local: ${error.message}`);
      }
    }
    
    // Fallback to local file
    const audioPath = path.join(__dirname, '../canary/audio', filename);
    
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${filename} (tried S3 and local)`);
    }
    
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');
    
    const chunkSize = 4096;
    const audioChunks = [];
    for (let i = 0; i < base64Audio.length; i += chunkSize) {
      audioChunks.push(base64Audio.slice(i, i + chunkSize));
    }
    
    return {
      name: filename,
      chunks: audioChunks,
      size: audioBuffer.length
    };
  }

  createWavHeader(dataLength, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataLength, 40);
    
    return header;
  }

  async saveAudioResponse(sessionId, audioBlobs) {
    try {
      // Combine all audio blobs into one buffer
      const audioBuffers = audioBlobs.map(blob => Buffer.from(blob, 'base64'));
      const combinedBuffer = Buffer.concat(audioBuffers);
      
      // Create WAV file with proper headers
      const wavHeader = this.createWavHeader(combinedBuffer.length);
      const wavBuffer = Buffer.concat([wavHeader, combinedBuffer]);
      
      // Create timestamp directory structure
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const recordingsDir = path.join('/tmp', 'recordings', timestamp);
      
      // Ensure directory exists
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }
      
      // Save to project recordings directory as .wav
      const audioPath = path.join(recordingsDir, `${sessionId}.wav`);
      fs.writeFileSync(audioPath, wavBuffer);
      console.log(`🎵 Saved audio response: ${audioPath} (${wavBuffer.length} bytes)`);
      
      // Also save to S3 if bucket is configured (for Lambda deployment)
      const bucket = process.env.TRANSCRIPT_BUCKET;
      if (bucket) {
        await this.s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `streaming-audio/${timestamp}/${sessionId}.wav`,
          Body: wavBuffer,
          ContentType: 'audio/wav'
        }));
        console.log(`☁️  Uploaded to S3: s3://${bucket}/streaming-audio/${timestamp}/${sessionId}.wav`);
      }
    } catch (error) {
      console.error('❌ Error saving audio:', error.message);
    }
  }

  async saveTranscript(sessionId, transcript, recordingsDir) {
    try {
      // Save locally
      const transcriptPath = path.join(recordingsDir, 'transcript.json');
      fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
      console.log(`📝 Saved transcript: ${transcriptPath}`);
      
      // Also save to S3 if bucket is configured
      const bucket = process.env.TRANSCRIPT_BUCKET;
      if (bucket) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await this.s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `transcripts/${timestamp}/transcript.json`,
          Body: JSON.stringify({ sessionId, timestamp: new Date().toISOString(), transcript }, null, 2),
          ContentType: 'application/json'
        }));
        console.log(`☁️  Transcript uploaded to S3: s3://${bucket}/transcripts/${timestamp}/transcript.json`);
      }
    } catch (error) {
      console.error('❌ Error saving transcript:', error.message);
    }
  }

  async saveMetrics(sessionId, metrics, recordingsDir) {
    try {
      // Save locally
      const metricsPath = path.join(recordingsDir, 'metrics.json');
      fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
      console.log(`📊 Saved metrics: ${metricsPath}`);
      
      // Also save to S3 if bucket is configured
      const bucket = process.env.TRANSCRIPT_BUCKET;
      if (bucket) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await this.s3.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `metrics/${timestamp}/metrics.json`,
          Body: JSON.stringify({ sessionId, timestamp: new Date().toISOString(), ...metrics }, null, 2),
          ContentType: 'application/json'
        }));
        console.log(`☁️  Metrics uploaded to S3: s3://${bucket}/metrics/${timestamp}/metrics.json`);
      }
    } catch (error) {
      console.error('❌ Error saving metrics:', error.message);
    }
  }

  async streamToAgent(sessionId, audioFiles, config = {}) {
    const startTime = Date.now();
    const userId = 'streaming-canary-user';
    const channelPath = `/event-bus/user/${userId}/${sessionId}`;
    
    console.log(`🔗 Connecting to: ${channelPath}`);
    const t1 = Date.now();
    const channel = await events.connect(channelPath);
    const channelConnectTime = Date.now() - t1;
    
    console.log('📤 Invoking agent...');
    const t2 = Date.now();
    await this.lambda.send(new InvokeCommand({
      FunctionName: AGENT_FUNCTION_NAME,
      InvocationType: 'Event',
      Payload: JSON.stringify({
        sessionId,
        userId,
        systemPrompt: 'You are a helpful assistant. Please respond briefly.',
        voiceId: 'tiffany',
        mcpConfig: { mcpServers: {} }
      }),
    }));
    const agentInvokeTime = Date.now() - t2;

    return new Promise((resolve) => {
      let currentTurn = 0;
      let agentSpeaking = false;
      let turn1Time = 0;
      let turn2Time = 0;
      let turn1Start = 0;
      let turn2Start = 0;
      let turn1SendEnd = 0;
      let turn2SendEnd = 0;
      let turn1FirstResponse = 0;
      let turn2FirstResponse = 0;
      let turn1SendTime = 0;
      let turn2SendTime = 0;
      let turn1ReasoningTime = 0;
      let turn2ReasoningTime = 0;
      let turn1ReceiveTime = 0;
      let turn2ReceiveTime = 0;
      let currentTurnAudioBlobs = []; // Audio for current turn
      let timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      let recordingsDir = path.join('/tmp', 'recordings', timestamp);
      let transcript = []; // Collect conversation transcript
      let readyWaitTime = 0; // Time waiting for first ready
      let firstReadyReceived = false;
      const readyWaitStart = Date.now();
      
      // Ensure directory exists
      if (!fs.existsSync(recordingsDir)) {
        fs.mkdirSync(recordingsDir, { recursive: true });
      }
      
      const sendNextTurn = async () => {
        if (currentTurn >= audioFiles.length) {
          // Send terminateSession to cleanly close the agent
          console.log('🛑 Sending terminateSession...');
          await channel.publish({
            direction: 'ctob',
            event: 'terminateSession',
            data: {}
          });
          
          const totalTime = Date.now() - startTime;
          
          // Clear timeout to prevent duplicate failure metric
          clearTimeout(timeoutId);
          
          // Publish metrics like existing canary
          await this.publishMetrics('SonicCanarySuccess', 1, sessionId);
          await this.publishMetrics('SonicCanaryTotalTime', totalTime, sessionId);
          await this.publishMetrics('SonicCanaryConversationDuration', totalTime, sessionId);
          await this.publishMetrics('SonicCanaryTurn1Time', turn1Time, sessionId);
          await this.publishMetrics('SonicCanaryTurn2Time', turn2Time, sessionId);
          await this.publishMetrics('SonicCanaryChannelConnectTime', channelConnectTime, sessionId);
          await this.publishMetrics('SonicCanaryAgentInvokeTime', agentInvokeTime, sessionId);
          await this.publishMetrics('SonicCanaryReadyWaitTime', readyWaitTime, sessionId);
          
          // Audio load time (passed from handler)
          if (config.audioLoadTime) {
            await this.publishMetrics('SonicCanaryAudioLoadTime', config.audioLoadTime, sessionId);
          }
          
          // Latency breakdown metrics
          await this.publishMetrics('SonicCanaryTurn1SendTime', turn1SendTime, sessionId);
          await this.publishMetrics('SonicCanaryTurn1ReasoningTime', turn1ReasoningTime, sessionId);
          await this.publishMetrics('SonicCanaryTurn1ReceiveTime', turn1ReceiveTime, sessionId);
          await this.publishMetrics('SonicCanaryTurn2SendTime', turn2SendTime, sessionId);
          await this.publishMetrics('SonicCanaryTurn2ReasoningTime', turn2ReasoningTime, sessionId);
          await this.publishMetrics('SonicCanaryTurn2ReceiveTime', turn2ReceiveTime, sessionId);
          
          // Combined latency metric (time to first response for both turns)
          const totalReasoningLatency = turn1ReasoningTime + turn2ReasoningTime;
          await this.publishMetrics('SonicCanaryTotalReasoningLatency', totalReasoningLatency, sessionId);
          
          // Save transcript and metrics
          if (transcript.length > 0) {
            await this.saveTranscript(sessionId, transcript, recordingsDir);
          }
          
          const metrics = {
            sessionId,
            totalTime,
            turn1Time,
            turn2Time,
            channelConnectTime,
            agentInvokeTime,
            readyWaitTime,
            turn1SendTime,
            turn1ReasoningTime,
            turn1ReceiveTime,
            turn2SendTime,
            turn2ReasoningTime,
            turn2ReceiveTime,
            timestamp: new Date().toISOString(),
            success: true
          };
          await this.saveMetrics(sessionId, metrics, recordingsDir);
          
          resolve({ 
            statusCode: 200, 
            message: 'Conversation completed',
            totalTime,
            turn1Time,
            turn2Time,
            channelConnectTime,
            agentInvokeTime,
            readyWaitTime,
            turn1SendTime,
            turn1ReasoningTime,
            turn1ReceiveTime,
            turn2SendTime,
            turn2ReasoningTime,
            turn2ReceiveTime
          });
          return;
        }
        
        const turnStart = Date.now();
        const audioFile = audioFiles[currentTurn];
        console.log(`🎵 Turn ${currentTurn + 1}: Streaming ${audioFile.name}...`);
        
        // Track turn start time
        if (currentTurn === 0) turn1Start = turnStart;
        else if (currentTurn === 1) turn2Start = turnStart;
        
        // Save input audio for this turn (16kHz for input files)
        const inputBuffer = Buffer.concat(audioFile.chunks.map(chunk => Buffer.from(chunk, 'base64')));
        const inputWavHeader = this.createWavHeader(inputBuffer.length, 16000); // 16kHz for input
        const inputWavBuffer = Buffer.concat([inputWavHeader, inputBuffer]);
        const inputPath = path.join(recordingsDir, `turn${currentTurn + 1}_input.wav`);
        fs.writeFileSync(inputPath, inputWavBuffer);
        console.log(`📥 Saved input: ${inputPath}`);
        
        // Upload to S3
        const bucket = process.env.TRANSCRIPT_BUCKET;
        if (bucket) {
          await this.s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: `recordings/${timestamp}/turn${currentTurn + 1}_input.wav`,
            Body: inputWavBuffer,
            ContentType: 'audio/wav'
          }));
          console.log(`☁️  Uploaded input to S3: s3://${bucket}/recordings/${timestamp}/turn${currentTurn + 1}_input.wav`);
        }
        
        const chunks = [...audioFile.chunks];
        // Add real analog silence after speaking
        const silenceChunks = this.loadSilence();
        chunks.push(...silenceChunks.slice(0, 10)); // Add some silence chunks
        
        await channel.publish({ 
          direction: 'ctob', 
          event: 'audioInput', 
          data: { 
            blobs: chunks, 
            sequence: currentTurn 
          } 
        });
        
        // Track when we finished sending
        const sendEndTime = Date.now();
        if (currentTurn === 0) {
          turn1SendEnd = sendEndTime;
          turn1SendTime = sendEndTime - turn1Start;
        } else if (currentTurn === 1) {
          turn2SendEnd = sendEndTime;
          turn2SendTime = sendEndTime - turn2Start;
        }
        
        console.log(`✅ Turn ${currentTurn + 1} sent, waiting for agent response...`);
        
        currentTurn++;
        agentSpeaking = true;
        currentTurnAudioBlobs = []; // Reset for this turn's output
      };
      
      // Listen for agent responses
      channel.subscribe({
        next: async (data) => {
          const eventType = data.event?.event || data.type;
          console.log('📨 Received:', eventType);
          
          // Track first response for reasoning latency
          const responseTime = Date.now();
          if ((eventType === 'textOutput' || eventType === 'audioOutput') && agentSpeaking) {
            if (currentTurn === 1 && !turn1FirstResponse) {
              turn1FirstResponse = responseTime;
              turn1ReasoningTime = responseTime - turn1SendEnd;
            } else if (currentTurn === 2 && !turn2FirstResponse) {
              turn2FirstResponse = responseTime;
              turn2ReasoningTime = responseTime - turn2SendEnd;
            }
          }
          
          if (eventType === 'audioOutput') {
            // Collect audio blobs for current turn
            for (const blob of data.event?.data?.blobs || []) {
              currentTurnAudioBlobs.push(blob);
            }
          } else if (eventType === 'textOutput') {
            const content = data.event?.data?.content;
            const role = data.event?.data?.role;
            
            if (content && content.includes('interrupted')) {
              console.log('⚠️  Agent was interrupted:', content);
            } else if (content && role) {
              // Add to transcript
              transcript.push({
                role: role,
                content: content,
                timestamp: new Date().toISOString(),
                turn: currentTurn
              });
              console.log('💬 Full textOutput data:', JSON.stringify(data, null, 2));
            }
          } else if (eventType === 'ready') {
            if (currentTurn === 0) {
              // Agent is ready, send first turn
              if (!firstReadyReceived) {
                readyWaitTime = Date.now() - readyWaitStart;
                firstReadyReceived = true;
              }
              sendNextTurn();
            }
          } else if (eventType === 'audioStop' && agentSpeaking) {
            // Agent finished speaking, calculate complete turn time and receive time
            const stopTime = Date.now();
            if (currentTurn === 1) {
              turn1Time = stopTime - turn1Start;
              turn1ReceiveTime = stopTime - turn1FirstResponse;
            } else if (currentTurn === 2) {
              turn2Time = stopTime - turn2Start;
              turn2ReceiveTime = stopTime - turn2FirstResponse;
            }
            
            // Save output audio for this turn
            if (currentTurnAudioBlobs.length > 0) {
              const outputBuffer = Buffer.concat(currentTurnAudioBlobs.map(blob => Buffer.from(blob, 'base64')));
              const outputWavHeader = this.createWavHeader(outputBuffer.length); // 24kHz for output
              const outputWavBuffer = Buffer.concat([outputWavHeader, outputBuffer]);
              const outputPath = path.join(recordingsDir, `turn${currentTurn}_output.wav`);
              fs.writeFileSync(outputPath, outputWavBuffer);
              console.log(`📤 Saved output: ${outputPath}`);
              
              // Upload to S3
              const bucket = process.env.TRANSCRIPT_BUCKET;
              if (bucket) {
                await this.s3.send(new PutObjectCommand({
                  Bucket: bucket,
                  Key: `recordings/${timestamp}/turn${currentTurn}_output.wav`,
                  Body: outputWavBuffer,
                  ContentType: 'audio/wav'
                }));
                console.log(`☁️  Uploaded output to S3: s3://${bucket}/recordings/${timestamp}/turn${currentTurn}_output.wav`);
              }
            }
            
            const delay = parseInt(process.env.TURN_DELAY_MS || '2000');
            console.log(`🔇 Agent finished speaking, waiting ${delay}ms before next turn...`);
            agentSpeaking = false;
            setTimeout(() => sendNextTurn(), delay);
          }
        },
        error: async (error) => {
          clearTimeout(timeoutId);
          await this.publishMetrics('SonicCanarySuccess', 0, sessionId);
          await this.publishMetrics('SonicCanaryFailure', 1, sessionId);
          resolve({ statusCode: 500, error: error.message });
        }
      });
      
      // Timeout with failure metrics
      const timeoutId = setTimeout(async () => {
        const totalTime = Date.now() - startTime;
        await this.publishMetrics('SonicCanarySuccess', 0, sessionId);
        await this.publishMetrics('SonicCanaryTimeout', 1, sessionId);
        await this.publishMetrics('SonicCanaryTotalTime', totalTime, sessionId);
        resolve({ statusCode: 200, message: 'Conversation timeout' });
      }, 30000);
    });
  }
}

module.exports = { StreamingCore };
