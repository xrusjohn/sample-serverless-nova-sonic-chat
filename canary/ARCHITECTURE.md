# Canary Testing Architecture

## Overview

The canary system consists of three main components that work together to test, record, and replay Nova Sonic conversations:

```
┌─────────────┐
│   Canary    │ ─── Runs two-turn conversation test
│   (canary.js)│    Records all events and audio
└──────┬──────┘
       │
       ├─── Collects audioOutput events
       │    (base64 encoded audio chunks)
       │
       ├─── Records all AppSync events
       │    (ready, textOutput, audioStop, etc.)
       │
       └─── Saves to recordings/{testId}/
            ├── turn1-audio.wav (agent audio response)
            ├── turn2-audio.wav (agent audio response)
            └── events.json (all events)
```

## Components

### 1. Canary (canary.js)

**Purpose**: Execute a two-turn conversation with Nova Sonic agent

**Flow**:
1. Connect to AppSync Events channel
2. Invoke Lambda to start Nova Sonic session
3. Send turn 1 audio input
4. Collect agent's text and audio responses
5. Send silence stream to maintain connection
6. Send turn 2 audio input
7. Collect agent's text and audio responses
8. Record everything and save to disk

**Key Features**:
- Tracks audio duration from received chunks
- Maintains continuous audio stream with silence between turns
- Collects full turn 2 response (handles interruption flag)
- Saves all events for replay

### 2. Audio Utils (audio-utils.js)

**Purpose**: Convert base64 audio chunks to WAV files

**Functions**:
- `base64ToBuffer()` - Decode base64 to binary
- `saveAudioToWav()` - Create WAV file with proper headers

**Why separate**: Reusable for other tools that need audio conversion

### 3. Recording Player (recording-player.tsx)

**Purpose**: Play back recorded conversations in GUI

**Features**:
- Loads turn1 and turn2 audio files
- Plays sequentially (turn1 → turn2)
- Stop button to interrupt playback

## Data Flow

### During Test Execution

```
AppSync Events
    ↓
Canary receives events
    ├─ audioOutput → extract base64 chunks → store in turn1/turn2AudioChunks
    ├─ textOutput → accumulate text
    ├─ audioStop → trigger next turn or finish
    └─ all events → recordingEvents array
    ↓
Test completes
    ↓
Audio Utils converts chunks to WAV
    ↓
Save to disk:
    recordings/{testId}/
    ├── turn1-audio.wav
    ├── turn2-audio.wav
    └── events.json
```

### During Playback

```
GUI loads recording
    ↓
RecordingPlayer fetches audio files
    ↓
Play turn1-audio.wav
    ↓
When complete, play turn2-audio.wav
    ↓
Playback finished
```

## Recording Structure

```json
{
  "testId": "uuid",
  "sessionId": "uuid",
  "timestamp": "ISO-8601",
  "events": [
    {
      "direction": "btoc",
      "event": "ready",
      "data": {}
    },
    {
      "direction": "ctob",
      "event": "audioInput",
      "data": { "blobs": [...], "sequence": 0 }
    },
    {
      "direction": "btoc",
      "event": "audioOutput",
      "data": { "blobs": [...], "sequence": 0 }
    },
    ...
  ]
}
```

## Key Design Decisions

1. **Separate Audio Files**: Turn 1 and Turn 2 audio saved separately for independent playback
2. **Base64 in Events**: Audio chunks stored as base64 in events.json for portability
3. **WAV Format**: Standard format for audio playback in browsers and tools
4. **Event Recording**: All events recorded for debugging and replay capability
5. **Silence Stream**: Continuous silence between turns prevents agent interruption detection

## Future Enhancements

- Event replay: Send recorded events back through AppSync to replay conversation
- Audio analysis: Extract metrics from recorded audio
- Comparison: Compare multiple test runs
- Streaming: Real-time playback as events arrive
