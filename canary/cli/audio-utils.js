const fs = require('fs');

function base64ToBuffer(base64) {
  return Buffer.from(base64, 'base64');
}

function saveAudioToWav(audioChunks, outputPath, sampleRate = 16000) {
  // Combine all base64 chunks into one buffer
  const buffers = audioChunks.map(chunk => base64ToBuffer(chunk));
  const audioData = Buffer.concat(buffers);
  
  // WAV header
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + audioData.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(audioData.length, 40);
  
  const wavFile = Buffer.concat([header, audioData]);
  fs.writeFileSync(outputPath, wavFile);
}

module.exports = {
  base64ToBuffer,
  saveAudioToWav
};
