import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

export async function POST(request: NextRequest) {
  try {
    const { audioChunks } = await request.json();
    
    if (!audioChunks || !Array.isArray(audioChunks)) {
      return NextResponse.json({ error: 'Invalid audio data' }, { status: 400 });
    }

    // Combine all audio chunks into one buffer
    const combinedAudio = audioChunks.join('');
    const audioBuffer = Buffer.from(combinedAudio, 'base64');

    // Save to canary audio bucket
    const bucketName = `sonic-canary-audio-${process.env.AWS_ACCOUNT_ID}-${process.env.AWS_REGION}`;
    
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: 'test-audio.raw',
      Body: audioBuffer,
      ContentType: 'application/octet-stream'
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving test audio:', error);
    return NextResponse.json({ error: 'Failed to save audio' }, { status: 500 });
  }
}