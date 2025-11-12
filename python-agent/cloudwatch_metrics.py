#!/usr/bin/env python3
"""
CloudWatch metrics publisher for Python canary.
Shared by both CLI and Lambda.
"""
import boto3
from datetime import datetime
from typing import Dict, Any, Optional


def publish_canary_metrics(
    metrics: Dict[str, Any],
    success: bool,
    namespace: str = "SonicCanaryPython",
    region: Optional[str] = None
) -> None:
    """
    Publish canary metrics to CloudWatch.
    
    Args:
        metrics: Dictionary of timing metrics from canary_core
        success: Whether the test succeeded
        namespace: CloudWatch namespace (default: SonicCanaryPython)
        region: AWS region (default: from boto3 session)
    """
    cloudwatch = boto3.client('cloudwatch', region_name=region)
    
    timestamp = datetime.utcnow()
    
    # Build metric data
    metric_data = [
        {
            'MetricName': 'Success',
            'Value': 1.0 if success else 0.0,
            'Unit': 'None',
            'Timestamp': timestamp
        }
    ]
    
    # Add timing metrics (convert ms to seconds for CloudWatch)
    timing_metrics = {
        'TotalTime': metrics.get('total_time', 0) / 1000,
        'ConnectTime': metrics.get('connect_time', 0) / 1000,
        'Turn1Time': metrics.get('turn1_time', 0) / 1000,
        'Turn1SendTime': metrics.get('turn1_send_time', 0) / 1000,
        'Turn1ReasoningTime': metrics.get('turn1_reasoning_time', 0) / 1000,
        'Turn1ReceiveTime': metrics.get('turn1_receive_time', 0) / 1000,
        'Turn2Time': metrics.get('turn2_time', 0) / 1000,
        'Turn2SendTime': metrics.get('turn2_send_time', 0) / 1000,
        'Turn2ReasoningTime': metrics.get('turn2_reasoning_time', 0) / 1000,
        'Turn2ReceiveTime': metrics.get('turn2_receive_time', 0) / 1000,
    }
    
    for metric_name, value in timing_metrics.items():
        if value > 0:  # Only publish non-zero metrics
            metric_data.append({
                'MetricName': metric_name,
                'Value': value,
                'Unit': 'Seconds',
                'Timestamp': timestamp
            })
    
    # Add audio chunks count
    audio_chunks = metrics.get('audio_chunks_received', 0)
    if audio_chunks > 0:
        metric_data.append({
            'MetricName': 'AudioChunksReceived',
            'Value': float(audio_chunks),
            'Unit': 'Count',
            'Timestamp': timestamp
        })
    
    # Publish in batches of 20 (CloudWatch limit)
    batch_size = 20
    for i in range(0, len(metric_data), batch_size):
        batch = metric_data[i:i + batch_size]
        cloudwatch.put_metric_data(
            Namespace=namespace,
            MetricData=batch
        )
    
    print(f"✅ Published {len(metric_data)} metrics to CloudWatch namespace: {namespace}")
