"""
Create a Bedrock Guardrail using boto3 SDK
"""
import boto3

bedrock = boto3.client('bedrock', region_name='us-east-1')

# Create guardrail with content filters and PII redaction
response = bedrock.create_guardrail(
    name='my-guardrail',
    description='Content moderation for voice agent',
    
    # Content filters - block harmful content
    contentPolicyConfig={
        'filtersConfig': [
            {'type': 'HATE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'VIOLENCE', 'inputStrength': 'MEDIUM', 'outputStrength': 'HIGH'},
            {'type': 'SEXUAL', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'MISCONDUCT', 'inputStrength': 'MEDIUM', 'outputStrength': 'MEDIUM'},
        ]
    },
    
    # PII redaction - mask sensitive information
    sensitiveInformationPolicyConfig={
        'piiEntitiesConfig': [
            {'type': 'EMAIL', 'action': 'BLOCK'},
            {'type': 'PHONE', 'action': 'ANONYMIZE'},
            {'type': 'CREDIT_DEBIT_CARD_NUMBER', 'action': 'BLOCK'},
            {'type': 'US_SOCIAL_SECURITY_NUMBER', 'action': 'BLOCK'},
        ]
    },
    
    # Topic denial - block specific topics
    topicPolicyConfig={
        'topicsConfig': [
            {
                'name': 'financial-advice',
                'definition': 'Investment advice or financial recommendations',
                'type': 'DENY'
            }
        ]
    },
    
    # Blocked messaging
    blockedInputMessaging='Sorry, I cannot process that request.',
    blockedOutputsMessaging='I cannot provide that information.',
    
    tags=[
        {'key': 'Environment', 'value': 'production'},
        {'key': 'Application', 'value': 'voice-agent'}
    ]
)

guardrail_id = response['guardrailId']
version = response['version']  # 'DRAFT'

print(f"Created guardrail: {guardrail_id}")
print(f"Version: {version}")
print(f"ARN: {response['guardrailArn']}")
