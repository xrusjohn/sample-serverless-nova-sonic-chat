#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { saveAudioToWav } = require('./audio-utils');

const audioFile1 = process.argv[2] || 'hi.raw';
const audioPath1 = path.join(__dirname, '../audio', audioFile1);

console.log(`Loading: ${audioPath1}`);
console.log(`Exists: ${fs.existsSync(audioPath1)}`);

if (!fs.existsSync(audioPath1)) {
  console.error('File not found');
  process.exit(1);
}

const buffer = fs.readFileSync(audioPath1);
console.log(`Buffer size: ${buffer.length} bytes`);

const arrayBufferToBase64 = (buffer) => {
  const binary = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary.push(String.fromCharCode(bytes[i]));
  }
  return Buffer.from(binary.join(''), 'binary').toString('base64');
};

const base64Audio = arrayBufferToBase64(buffer);
console.log(`Base64 length: ${base64Audio.length}`);

const chunkSize = 512;
const chunks = [];
for (let i = 0; i < base64Audio.length; i += chunkSize) {
  chunks.push(base64Audio.slice(i, i + chunkSize));
}
console.log(`Chunks: ${chunks.length}`);
console.log(`First chunk length: ${chunks[0].length}`);
console.log(`Last chunk length: ${chunks[chunks.length - 1].length}`);

// Test saving
const testDir = path.join(__dirname, '../recordings/debug-test');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

saveAudioToWav(chunks, path.join(testDir, 'test-output.wav'));
console.log(`Saved to ${testDir}/test-output.wav`);

const savedBuffer = fs.readFileSync(path.join(testDir, 'test-output.wav'));
console.log(`Saved file size: ${savedBuffer.length} bytes`);
