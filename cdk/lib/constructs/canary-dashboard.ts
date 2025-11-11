import { Dashboard, GraphWidget, Metric, SingleValueWidget, MathExpression } from 'aws-cdk-lib/aws-cloudwatch';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CanaryDashboard extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dashboard = new Dashboard(this, 'DashboardV3', {
      dashboardName: 'SonicCanaryV3',
    });

    const successRate = new Metric({
      namespace: 'SonicCanary',
      metricName: 'SonicCanarySuccess',
      statistic: 'Average',
    });

    const totalTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTotalTime', statistic: 'Average' });
    const conversationDuration = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryConversationDuration', statistic: 'Average' });
    const totalReasoningLatency = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTotalReasoningLatency', statistic: 'Average' });
    const audioLoadTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryAudioLoadTime', statistic: 'Average' });
    const turn1Time = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1Time', statistic: 'Average' });
    const turn2Time = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn2Time', statistic: 'Average' });
    const channelConnectTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryChannelConnectTime', statistic: 'Average' });
    const agentInvokeTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryAgentInvokeTime', statistic: 'Average' });
    const readyWaitTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryReadyWaitTime', statistic: 'Average' });

    // Streaming Canary metrics
    const streamingSuccessRate = new Metric({
      namespace: 'SonicCanary',
      metricName: 'SonicCanarySuccess',
      statistic: 'Average',
    });
    const streamingTotalTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTotalTime', statistic: 'Average' });
    const streamingTurn1ReasoningTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1ReasoningTime', statistic: 'Average' });
    const streamingTurn2ReasoningTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn2ReasoningTime', statistic: 'Average' });
    const streamingTurn1SendTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1SendTime', statistic: 'Average' });
    const streamingTurn1ReceiveTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1ReceiveTime', statistic: 'Average' });

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

    const bedrockThrottles = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'InvocationThrottles',
      statistic: 'Sum',
      dimensionsMap: { ModelId: 'amazon.nova-sonic-v1:0' },
    });

    const bedrockServerErrors = new Metric({
      namespace: 'AWS/Bedrock',
      metricName: 'InvocationServerErrors',
      statistic: 'Sum',
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
        stacked: true,
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Startup Timing Breakdown',
        left: [audioLoadTime, channelConnectTime, agentInvokeTime, readyWaitTime],
        width: 12,
        height: 6,
        stacked: true,
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
        title: 'Bedrock Error Breakdown',
        left: [bedrockErrors, bedrockThrottles, bedrockServerErrors],
        width: 12,
        height: 6,
        stacked: true,
      })
    );

    // Row 7: Duration and Latency Comparison
    dashboard.addWidgets(
      new GraphWidget({
        title: 'Conversation Duration: Canary vs Bedrock',
        left: [conversationDuration, bedrockLatency],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Nova Sonic Reasoning Latency',
        left: [totalReasoningLatency],
        width: 12,
        height: 6,
      })
    );
  }
}
