class SimpleAudioPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.totalPlaybackTime = 0;
  }

  addAudioChunk(base64Audio) {
    // Decode base64 to get byte length
    const binaryString = Buffer.from(base64Audio, 'base64').toString('binary');
    const bytes = binaryString.length;
    
    // 16-bit audio = 2 bytes per sample
    const numSamples = bytes / 2;
    const durationMs = (numSamples / this.sampleRate) * 1000;
    
    this.totalPlaybackTime += durationMs;
  }

  async waitForPlaybackComplete() {
    if (this.totalPlaybackTime > 0) {
      await new Promise(resolve => setTimeout(resolve, this.totalPlaybackTime));
    }
    
    this.totalPlaybackTime = 0;
  }

  close() {
    // Cleanup
  }
}

module.exports = { SimpleAudioPlayer };
