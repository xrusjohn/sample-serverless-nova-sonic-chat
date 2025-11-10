import { readFileSync } from 'fs';
import { NovaStream } from './nova-stream';

export class ContinuousAudioStream {
  private audioBuffers: Buffer[] = [];
  private currentFileIndex = 0;
  private currentPosition = 0;
  private isStreaming = false;
  private streamInterval: NodeJS.Timeout | null = null;
  private readonly sampleRate = 16000;
  private readonly bytesPerSample = 2;
  
  constructor(
    private novaStream: NovaStream,
    private chunkSizeMs = 100
  ) {}

  public loadAudioFiles(filePaths: string[]) {
    this.audioBuffers = filePaths.map(path => readFileSync(path));
  }

  private generateSilence(durationMs: number): string {
    const sampleRate = 16000;
    const bytesPerSample = 2;
    const samples = Math.floor((sampleRate * durationMs) / 1000);
    const buffer = Buffer.alloc(samples * bytesPerSample, 0);
    return buffer.toString('base64');
  }

  public startContinuousStream(silencePaddingMs = 500) {
    if (this.isStreaming) return;
    
    this.isStreaming = true;
    this.currentFileIndex = 0;
    
    const streamChunk = () => {
      if (!this.isStreaming) return;
      
      const audioChunk = this.getNextAudioChunk();
      this.novaStream.enqueueAudioInput([audioChunk]);
      
      this.streamInterval = setTimeout(streamChunk, this.chunkSizeMs);
    };
    
    streamChunk();
  }

  private getNextAudioChunk(): string {
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

  private shouldResetToFirstFile(): boolean {
    // Reset after all files are played
    if (this.currentFileIndex >= this.audioBuffers.length) {
      this.currentFileIndex = 0;
      this.currentPosition = 0;
      return true;
    }
    return false;
  }

  public stopStream() {
    this.isStreaming = false;
    if (this.streamInterval) {
      clearTimeout(this.streamInterval);
      this.streamInterval = null;
    }
  }
}
