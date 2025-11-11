# Python Canary Tests

## Running Tests

### Unit Tests
```bash
cd python-agent
pip install pytest pytest-asyncio websockets
python -m pytest test_canary.py -v
```

### Integration Test (with mock agent)
```bash
python -m pytest test_integration.py -v -s
```

### Manual Test with Mock Agent

Terminal 1 - Start mock agent:
```bash
python test_mock_agent.py
```

Terminal 2 - Run canary CLI:
```bash
python canary_cli.py \
  --ws-url ws://localhost:8765 \
  --audio1 ../canary/audio/hi.wav \
  --audio2 ../canary/audio/good_morning_nova.wav \
  --output-dir ./test-recordings
```

## Test Results

✅ **Unit Tests** (5/5 passed)
- Audio file loading and chunking
- WAV file generation
- Module imports
- Error handling

✅ **Integration Test** (1/1 passed)
- Full 2-turn conversation flow
- Protocol message exchange
- Timing metrics collection
- Audio response handling

## Next Steps

1. Test against real Node.js agent (when available)
2. Create Lambda canary wrapper
3. Deploy and test scheduled canary
