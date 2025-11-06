'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface RecordingPlayerProps {
  recordingPath: string;
}

export function RecordingPlayer({ recordingPath }: RecordingPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [turn1Audio, setTurn1Audio] = useState<HTMLAudioElement | null>(null);
  const [turn2Audio, setTurn2Audio] = useState<HTMLAudioElement | null>(null);

  const playRecording = async () => {
    setIsPlaying(true);
    try {
      // Load and play turn 1 audio
      const turn1Response = await fetch(`${recordingPath}/turn1-audio.wav`);
      if (turn1Response.ok) {
        const turn1Blob = await turn1Response.blob();
        const turn1Url = URL.createObjectURL(turn1Blob);
        const turn1 = new Audio(turn1Url);
        setTurn1Audio(turn1);
        
        turn1.onended = async () => {
          // Play turn 2 audio after turn 1 completes
          const turn2Response = await fetch(`${recordingPath}/turn2-audio.wav`);
          if (turn2Response.ok) {
            const turn2Blob = await turn2Response.blob();
            const turn2Url = URL.createObjectURL(turn2Blob);
            const turn2 = new Audio(turn2Url);
            setTurn2Audio(turn2);
            turn2.play();
            
            turn2.onended = () => {
              setIsPlaying(false);
            };
          }
        };
        
        turn1.play();
      }
    } catch (error) {
      console.error('Failed to play recording:', error);
      setIsPlaying(false);
    }
  };

  const stopRecording = () => {
    turn1Audio?.pause();
    turn2Audio?.pause();
    setIsPlaying(false);
  };

  return (
    <Card className="p-4">
      <div className="flex gap-2">
        <Button
          onClick={playRecording}
          disabled={isPlaying}
          variant="outline"
        >
          ▶️ Play Recording
        </Button>
        <Button
          onClick={stopRecording}
          disabled={!isPlaying}
          variant="outline"
        >
          ⏹️ Stop
        </Button>
      </div>
    </Card>
  );
}
