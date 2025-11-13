#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Import real Nova Sonic components
const { NovaStream } = require('../../app/src/agent/nova-stream');
const { ContinuousAudioStream } = require('../../app/src/agent/continuous-audio-stream');

const arrayBufferToBase64 = (buffer) => {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return Buffer.from(binary.join(''), 'binary').toString('base64');
};

class LocalContinuousAudioStream {
  constructor(novaStream) {
    this.novaStream = novaStream;
    this.audioBuffers = [];
    this.currentFileIndex = 0;
    this.currentPosition = 0;
    this.isStreaming = false;
    this.streamInterval = null;
    this.sampleRate = 16000;
    this.bytesPerSample = 2;
    this.chunkSizeMs = parseInt(process.env.STREAMING_CHUNK_SIZE_MS) || 100;
    this.audioResponseCount = 0;
  }

  loadAudioFiles(filePaths) {
    console.log(`📁 Loading ${filePaths.length} audio files...`);
    this.audioBuffers = filePaths.map(filePath => {
      const buffer = fs.readFileSync(filePath);
      console.log(`  - ${path.basename(filePath)}: ${buffer.length} bytes`);
      return buffer;
    });
  }

  generateSilence(durationMs) {
    const samples = Math.floor((this.sampleRate * durationMs) / 1000);
    const buffer = Buffer.alloc(samples * this.bytesPerSample, 0);
    return buffer.toString('base64');
  }

  getNextAudioChunk() {
    const chunkBytes = Math.floor((this.sampleRate * this.chunkSizeMs * this.bytesPerSample) / 1000);
    
    // Check if we need to reset to first file
    if (this.currentFileIndex >= this.audioBuffers.length) {
      this.currentFileIndex = 0;
      this.currentPosition = 0;
    }
    
    // If no audio files, generate silence
    if (this.audioBuffers.length === 0) {
      return this.generateSilence(this.chunkSizeMs);
    }
    
    const currentBuffer = this.audioBuffers[this.currentFileIndex];
    const endPosition = this.currentPosition + chunkBytes;
    
    if (endPosition >= currentBuffer.length) {
      // End of current file, move to next
      const remainingBytes = currentBuffer.length - this.currentPosition;
      const chunk = Buffer.alloc(chunkBytes, 0);
      
      if (remainingBytes > 0) {
        currentBuffer.copy(chunk, 0, this.currentPosition, currentBuffer.length);
      }
      
      this.currentFileIndex++;
      this.currentPosition = 0;
      
      return chunk.toString('base64');
    } else {
      // Normal chunk from current file
      const chunk = currentBuffer.subarray(this.currentPosition, endPosition);
      this.currentPosition = endPosition;
      return chunk.toString('base64');
    }
  }

  startContinuousStream(silencePaddingMs = 500) {
    if (this.isStreaming) return;
    
    console.log('🎤 Starting continuous audio streaming...');
    this.isStreaming = true;
    this.currentFileIndex = 0;
    this.currentPosition = 0;
    
    let chunkCount = 0;
    const durationSeconds = parseInt(process.env.STREAMING_DURATION_SECONDS) || 8;
    const maxChunks = Math.floor((durationSeconds * 1000) / this.chunkSizeMs);
    
    console.log(`⏱️  Streaming for ${durationSeconds} seconds (${maxChunks} chunks at ${this.chunkSizeMs}ms each)`);
    
    const streamChunk = () => {
      if (!this.isStreaming || chunkCount >= maxChunks) {
        this.stopStream();
        return;
      }
      
      const audioChunk = this.getNextAudioChunk();
      
      // Send to Nova Sonic
      if (this.novaStream && this.novaStream.isOpen) {
        this.novaStream.enqueueAudioInput([audioChunk]);
        
        // Simulate Nova Sonic text response every 20 chunks (~2 seconds)
        if (chunkCount > 0 && chunkCount % 20 === 0) {
          this.audioResponseCount++;
          const textResponse = this.novaStream.getResponse();
          console.log(`🗣️  Nova Sonic: "${textResponse}"`);
        }
      }
      
      // Only show progress every 10 chunks to reduce noise
      if (chunkCount % 10 === 0) {
        console.log(`📤 Streaming progress: ${chunkCount + 1}/${maxChunks} chunks (${Math.round((chunkCount/maxChunks)*100)}%)`);
      }
      
      chunkCount++;
      this.streamInterval = setTimeout(streamChunk, this.chunkSizeMs);
    };
    
    streamChunk();
  }

  stopStream() {
    console.log('⏹️  Stopping continuous stream');
    this.isStreaming = false;
    if (this.streamInterval) {
      clearTimeout(this.streamInterval);
      this.streamInterval = null;
    }
  }
}

async function runLocalStreamingAgent(audioFiles) {
  const startTime = Date.now();
  const sessionId = `streaming-${Date.now()}`;
  console.log('🎯 Starting local streaming agent...');

  try {
    // Create Nova Sonic stream
    const novaStream = new MockNovaStream(
      sessionId,
      process.env.VOICE_ID || 'Aria',
      process.env.SYSTEM_PROMPT || 'You are a helpful assistant.'
    );
    
    await novaStream.open();

    // Create continuous audio stream
    const continuousStream = new LocalContinuousAudioStream(novaStream);
    
    if (audioFiles && audioFiles.length > 0) {
      // Use provided audio files
      console.log(`📁 Processing ${audioFiles.length} provided audio files`);
      const testAudioPaths = [];
      
      for (let i = 0; i < audioFiles.length; i++) {
        const audioFile = audioFiles[i];
        const filePath = `/tmp/local-streaming-audio-${i}.raw`;
        
        // Decode base64 audio data and write to file
        const audioBuffer = Buffer.from(audioFile.data, 'base64');
        fs.writeFileSync(filePath, audioBuffer);
        testAudioPaths.push(filePath);
        
        console.log(`📄 Saved audio file: ${audioFile.name} (${audioBuffer.length} bytes)`);
      }
      
      // Load audio files into continuous stream
      continuousStream.loadAudioFiles(testAudioPaths);
    } else {
      // Load default canary audio files
      const audioPath1 = path.join(__dirname, '../audio/hello_how_are_you.raw');
      const audioPath2 = path.join(__dirname, '../audio/what_is_the_weather_like.raw');
      const silencePath = path.join(__dirname, '../audio/silence_1s.raw');
      
      const defaultFiles = [];
      if (fs.existsSync(audioPath1)) defaultFiles.push(audioPath1);
      if (fs.existsSync(audioPath2)) defaultFiles.push(audioPath2);
      
      if (defaultFiles.length > 0) {
        continuousStream.loadAudioFiles(defaultFiles);
      } else {
        console.log('⚠️  No audio files found, using silence');
      }
    }
    
    // Start continuous streaming
    continuousStream.startContinuousStream(1000);
    
    // Wait for streaming to complete
    await new Promise(resolve => {
      const checkComplete = () => {
        if (!continuousStream.isStreaming) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };
      checkComplete();
    });
    
    // Cleanup Nova Sonic
    novaStream.terminate();
    
    const sessionDuration = Date.now() - startTime;
    console.log(`✓ Streaming session duration: ${sessionDuration}ms`);
    console.log(`✓ Audio files processed: ${audioFiles?.length || 'default'}`);
    console.log(`✓ Nova Sonic responses: ${continuousStream.audioResponseCount}`);
    console.log('✅ Local streaming session completed');
    
    return {
      success: true,
      duration: sessionDuration,
      audioFilesProcessed: audioFiles?.length || 2,
      streamingMode: true,
      novaResponses: continuousStream.audioResponseCount
    };

  } catch (error) {
    console.error('❌ Local streaming agent error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { runLocalStreamingAgent };

// Run directly if called
if (require.main === module) {
  runLocalStreamingAgent()
    .then(result => {
      console.log('Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
