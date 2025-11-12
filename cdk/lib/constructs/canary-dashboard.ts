import { Dashboard, GraphWidget, Metric, SingleValueWidget, MathExpression } from 'aws-cdk-lib/aws-cloudwatch';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CanaryDashboard extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const dashboard = new Dashboard(this, 'DashboardV4', {
      dashboardName: 'SonicCanaryV4',
    });

    // Node.js Canary Metrics
    const successRate = new Metric({
      namespace: 'SonicCanary',
      metricName: 'SonicCanarySuccess',
      statistic: 'Average',
      label: 'Node.js Success',
    });

    const timeoutRate = new Metric({
      namespace: 'SonicCanary',
      metricName: 'SonicCanaryTimeout',
      statistic: 'Average',
    });

    const failureRate = new Metric({
      namespace: 'SonicCanary',
      metricName: 'SonicCanaryFailure',
      statistic: 'Average',
    });

    // Python Canary Metrics
    const pythonSuccess = new Metric({
      namespace: 'SonicCanaryPython',
      metricName: 'Success',
      statistic: 'Average',
      label: 'Python Success',
    });

    const pythonTotalTime = new Metric({
      namespace: 'SonicCanaryPython',
      metricName: 'TotalTime',
      statistic: 'Average',
      label: 'Python Total Time',
    });

    const pythonTurn1Time = new Metric({
      namespace: 'SonicCanaryPython',
      metricName: 'Turn1Time',
      statistic: 'Average',
      label: 'Python Turn 1',
    });

    const pythonTurn2Time = new Metric({
      namespace: 'SonicCanaryPython',
      metricName: 'Turn2Time',
      statistic: 'Average',
      label: 'Python Turn 2',
    });

    const pythonConnectTime = new Metric({
      namespace: 'SonicCanaryPython',
      metricName: 'ConnectTime',
      statistic: 'Average',
      label: 'Python Connect',
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

    const turn1ReasoningTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1ReasoningTime', statistic: 'Average' });
    const turn2ReasoningTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn2ReasoningTime', statistic: 'Average' });
    const turn1SendTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1SendTime', statistic: 'Average' });
    const turn1ReceiveTime = new Metric({ namespace: 'SonicCanary', metricName: 'SonicCanaryTurn1ReceiveTime', statistic: 'Average' });

    const successRatePercent = new MathExpression({
      expression: 'm1 * 100',
      usingMetrics: { m1: successRate },
      label: 'Success Rate %',
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

    // Row 1: Success Rates (Node.js vs Python)
    dashboard.addWidgets(
      new SingleValueWidget({
        title: 'Node.js Success Rate',
        metrics: [successRatePercent],
        sparkline: true,
        width: 6,
        height: 3,
        period: Duration.minutes(5),
      }),
      new SingleValueWidget({
        title: 'Python Success Rate',
        metrics: [new MathExpression({
          expression: 'm1 * 100',
          usingMetrics: { m1: pythonSuccess },
          label: 'Python Success %',
        })],
        sparkline: true,
        width: 6,
        height: 3,
        period: Duration.minutes(5),
      }),
      new SingleValueWidget({
        title: 'Node.js Avg Total Time',
        metrics: [totalTime],
        sparkline: true,
        width: 6,
        height: 3,
        period: Duration.minutes(5),
      }),
      new SingleValueWidget({
        title: 'Python Avg Total Time',
        metrics: [pythonTotalTime],
        sparkline: true,
        width: 6,
        height: 3,
        period: Duration.minutes(5),
      }),
    );

    dashboard.addWidgets(
      new SingleValueWidget({
        title: 'Turn 1 Reasoning Latency',
        metrics: [turn1ReasoningTime],
        sparkline: true,
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Turn 2 Reasoning Latency',
        metrics: [turn2ReasoningTime],
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
        title: 'Latency Breakdown (Turn 1)',
        left: [turn1SendTime, turn1ReasoningTime, turn1ReceiveTime],
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
        left: [turn1ReasoningTime, turn2ReasoningTime],
        width: 12,
        height: 6,
      })
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Canary Success Comparison',
        left: [successRate, pythonSuccess],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Node.js Canary Test Results',
        left: [successRate, timeoutRate, failureRate],
        width: 12,
        height: 6,
        stacked: true,
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Total Time Comparison (Node.js vs Python)',
        left: [totalTime, pythonTotalTime],
        width: 12,
        height: 6,
      }),
      new GraphWidget({
        title: 'Turn Time Comparison',
        left: [turn1Time, turn2Time, pythonTurn1Time, pythonTurn2Time],
        width: 12,
        height: 6,
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: 'Python Canary Connect Time',
        left: [pythonConnectTime],
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
