#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const inputFile = process.argv[2];

if (!inputFile) {
  console.error('Usage: node convert-audio.js <input-file>');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`File not found: ${inputFile}`);
  process.exit(1);
}

const dir = path.dirname(inputFile);
const filename = path.basename(inputFile);
const archiveDir = path.join(dir, 'archive');

// Create archive directory if it doesn't exist
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

console.log(`Converting ${filename} to Nova Sonic format...`);
console.log(`  Target: 16-bit PCM, mono, 16kHz`);

try {
  // Convert in-place
  execSync(`ffmpeg -i "${inputFile}" -acodec pcm_s16le -ac 1 -ar 16000 "${inputFile}.tmp" -y`, {
    stdio: 'pipe'
  });
  
  // Replace original with converted
  fs.renameSync(`${inputFile}.tmp`, inputFile);
  
  // Archive original by moving to archive dir
  const archivePath = path.join(archiveDir, `${filename}.bak`);
  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
  }
  
  console.log(`✓ Converted: ${filename}`);
  console.log(`✓ Original archived: archive/${filename}.bak`);
} catch (error) {
  console.error('Conversion failed. Make sure ffmpeg is installed.');
  process.exit(1);
}
