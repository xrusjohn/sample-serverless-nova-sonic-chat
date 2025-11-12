import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import { Construct } from 'constructs';

export class GuardrailStack extends cdk.Stack {
  public readonly guardrail: bedrock.CfnGuardrail;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Bedrock Guardrail
    this.guardrail = new bedrock.CfnGuardrail(this, 'VoiceAgentGuardrail', {
      name: 'voice-agent-guardrail',
      description: 'Content moderation for Nova Sonic voice agent',
      
      // Content filters
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'VIOLENCE', inputStrength: 'MEDIUM', outputStrength: 'HIGH' },
          { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
          { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
        ],
      },
      
      // PII redaction
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'BLOCK' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
        ],
      },
      
      // Topic denial
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'financial-advice',
            definition: 'Investment advice or financial recommendations',
            type: 'DENY',
          },
        ],
      },
      
      blockedInputMessaging: 'Sorry, I cannot process that request.',
      blockedOutputsMessaging: 'I cannot provide that information.',
      
      tags: [
        { key: 'Environment', value: 'production' },
        { key: 'Application', value: 'voice-agent' },
      ],
    });

    // Create version
    const version = new bedrock.CfnGuardrailVersion(this, 'GuardrailVersion', {
      guardrailIdentifier: this.guardrail.attrGuardrailId,
      description: 'Production v1',
    });

    // Outputs
    new cdk.CfnOutput(this, 'GuardrailId', {
      value: this.guardrail.attrGuardrailId,
    });

    new cdk.CfnOutput(this, 'GuardrailArn', {
      value: this.guardrail.attrGuardrailArn,
    });

    new cdk.CfnOutput(this, 'GuardrailVersion', {
      value: version.attrVersion,
    });
  }
}
