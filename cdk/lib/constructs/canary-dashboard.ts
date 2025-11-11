import { Dashboard, GraphWidget, Metric, SingleValueWidget, MathExpression } from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class CanaryDashboard extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dashboard = new Dashboard(this, 'Dashboard', {
      dashboardName: 'SonicCanary',
    });

    const successRate = new Metric({
      namespace: 'SonicCanary',
      metricName: 'CanarySuccess',
      statistic: 'Average',
    });

    const totalTime = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryTotalTime', statistic: 'Average' });
    const turn1Time = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryTurn1Time', statistic: 'Average' });
    const turn2Time = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryTurn2Time', statistic: 'Average' });
    const audioLoadTime = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryAudioLoadTime', statistic: 'Average' });
    const channelConnectTime = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryChannelConnectTime', statistic: 'Average' });
    const agentInvokeTime = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryAgentInvokeTime', statistic: 'Average' });
    const readyWaitTime = new Metric({ namespace: 'SonicCanary', metricName: 'CanaryReadyWaitTime', statistic: 'Average' });

    // Streaming Canary metrics
    const streamingSuccessRate = new Metric({
      namespace: 'StreamingCanary',
      metricName: 'StreamingCanarySuccess',
      statistic: 'Average',
    });
    const streamingTotalTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryTotalTime', statistic: 'Average' });
    const streamingTurn1ReasoningTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryTurn1ReasoningTime', statistic: 'Average' });
    const streamingTurn2ReasoningTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryTurn2ReasoningTime', statistic: 'Average' });
    const streamingTurn1SendTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryTurn1SendTime', statistic: 'Average' });
    const streamingTurn1ReceiveTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryTurn1ReceiveTime', statistic: 'Average' });
    const streamingChannelConnectTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryChannelConnectTime', statistic: 'Average' });
    const streamingReadyWaitTime = new Metric({ namespace: 'StreamingCanary', metricName: 'StreamingCanaryReadyWaitTime', statistic: 'Average' });

    // Convert success rates to percentages
    const successRatePercent = new MathExpression({
      expression: 'm1 * 100',
      usingMetrics: { m1: successRate },
      label: 'Success Rate %',
    });

    const streamingSuccessRatePercent = new MathExpression({
      expression: 'm1 * 100', 
      usingMetrics: { m1: streamingSuccessRate },
      label: 'Streaming Success Rate %',
    });

    // Bedrock metrics
    const bedrockInvocations = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'Invocations',
      statistic: 'Sum',
      dimensionsMap: { ModelId: 'amazon.nova-sonic-v1:0' },
    });
    const bedrockInputTokens = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'InputSpeechTokenCount',
      statistic: 'Sum',
      dimensionsMap: { ModelId: 'amazon.nova-sonic-v1:0' },
    });
    const bedrockOutputTokens = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'OutputSpeechTokenCount',
      statistic: 'Sum',
      dimensionsMap: { ModelId: 'amazon.nova-sonic-v1:0' },
    });
    const bedrockErrors = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'InvocationClientErrors',
      statistic: 'Sum',
      dimensionsMap: { ModelId: 'amazon.nova-sonic-v1:0' },
    });
    
    const bedrockLatency = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'InvocationLatency',
      statistic: 'Average',
      dimensionsMap: { ModelId: 'amazon.nova-sonic-v1:0' },
    });

    dashboard.addWidgets(
      new SingleValueWidget({
        title: 'Success Rate (Last Hour)',
        metrics: [successRatePercent],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Avg Total Time (Last Hour)',
        metrics: [totalTime],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Streaming Success Rate',
        metrics: [streamingSuccessRatePercent],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Streaming Total Time',
        metrics: [streamingTotalTime],
        sparkline: true,
        width: 6,
        height: 3,
      })
    );

    dashboard.addWidgets(
      new SingleValueWidget({
        title: 'Turn 1 Reasoning Latency',
        metrics: [streamingTurn1ReasoningTime],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Turn 2 Reasoning Latency',
        metrics: [streamingTurn2ReasoningTime],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Avg Turn 1 Time',
        metrics: [turn1Time],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Avg Turn 2 Time',
        metrics: [turn2Time],
        sparkline: true,
        width: 6,
        height: 3,
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'End-to-End Timing',
        left: [totalTime, turn1Time, turn2Time],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Streaming Latency Breakdown (Turn 1)',
        left: [streamingTurn1SendTime, streamingTurn1ReasoningTime, streamingTurn1ReceiveTime],
        width: 12,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Startup Timing Breakdown',
        left: [audioLoadTime, channelConnectTime, agentInvokeTime, readyWaitTime],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Nova Sonic Reasoning Latency',
        left: [streamingTurn1ReasoningTime, streamingTurn2ReasoningTime],
        width: 12,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Success Rate Over Time',
        left: [successRate],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Bedrock Nova Sonic Invocations',
        left: [bedrockInvocations],
        width: 12,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Bedrock Token Usage',
        left: [bedrockInputTokens, bedrockOutputTokens],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Bedrock Client Errors',
        left: [bedrockErrors],
        width: 12,
        height: 6,
      })
    );

    // Row 7: Bedrock Latency
    dashboard.addWidgets(
      new GraphWidget({
        title: 'Bedrock Invocation Latency',
        left: [bedrockLatency],
        width: 24,
        height: 6,
      })
    );
  }
}
