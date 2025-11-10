import { Dashboard, GraphWidget, Metric, SingleValueWidget } from 'aws-cdk-lib/aws-cloudwatch';
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

    dashboard.addWidgets(
      new SingleValueWidget({
        title: 'Success Rate (Last Hour)',
        metrics: [successRate],
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Avg Total Time (Last Hour)',
        metrics: [totalTime],
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Avg Turn 1 Time',
        metrics: [turn1Time],
        width: 6,
        height: 3,
      }),
      new SingleValueWidget({
        title: 'Avg Turn 2 Time',
        metrics: [turn2Time],
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
        title: 'Startup Timing Breakdown',
        left: [audioLoadTime, channelConnectTime, agentInvokeTime, readyWaitTime],
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
  }
}
