# Dockerfile for Nova Sonic Python WebSocket Agent
# Works with both ECS Fargate and App Runner

FROM public.ecr.aws/docker/library/python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (configurable via PORT env var)
EXPOSE 9000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import socket; s=socket.socket(); s.connect(('localhost', int(__import__('os').environ.get('PORT', 9000)))); s.close()" || exit 1

# Run the WebSocket server
CMD ["python", "sonic_agent_local.py"]
