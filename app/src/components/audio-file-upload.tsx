'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Play } from 'lucide-react';

interface AudioFileUploadProps {
  onAudioSelected: (audioData: ArrayBuffer, fileName: string) => void;
  disabled?: boolean;
}

export default function AudioFileUpload({ onAudioSelected, disabled }: AudioFileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please select an audio file');
      return;
    }

    setSelectedFile(file);
    setIsProcessing(true);

    try {
      // Convert to ArrayBuffer for processing
      const arrayBuffer = await file.arrayBuffer();
      onAudioSelected(arrayBuffer, file.name);
    } catch (error) {
      console.error('Error processing audio file:', error);
      alert('Error processing audio file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePlayPreview = () => {
    if (selectedFile && audioRef.current) {
      const url = URL.createObjectURL(selectedFile);
      audioRef.current.src = url;
      audioRef.current.play();
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Audio File Upload:</label>
      
      {!selectedFile ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            disabled={disabled || isProcessing}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isProcessing ? 'Processing...' : 'Select Audio File'}
          </Button>
          <p className="text-xs text-gray-500 mt-2">
            Supports MP3, WAV, M4A, and other audio formats
          </p>
        </div>
      ) : (
        <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{selectedFile.name}</div>
              <div className="text-xs text-gray-500">
                ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                onClick={handlePlayPreview}
                variant="ghost"
                size="sm"
                disabled={disabled}
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleRemoveFile}
                variant="ghost"
                size="sm"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}