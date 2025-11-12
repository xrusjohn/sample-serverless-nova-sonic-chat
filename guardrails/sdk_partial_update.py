"""
Update specific guardrail components without changing others
"""
import boto3

bedrock = boto3.client('bedrock', region_name='us-east-1')

guardrail_id = 'your-guardrail-id'

# Get current guardrail configuration
current = bedrock.get_guardrail(
    guardrailIdentifier=guardrail_id,
    guardrailVersion='DRAFT'
)

# Update ONLY content filters, keep everything else the same
response = bedrock.update_guardrail(
    guardrailIdentifier=guardrail_id,
    name=current['name'],
    description=current.get('description', ''),
    
    # UPDATED: Stricter content filters
    contentPolicyConfig={
        'filtersConfig': [
            {'type': 'HATE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'VIOLENCE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},  # Changed from MEDIUM
            {'type': 'SEXUAL', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'MISCONDUCT', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},  # Changed from MEDIUM
        ]
    },
    
    # UNCHANGED: Keep existing PII config
    sensitiveInformationPolicyConfig=current.get('sensitiveInformationPolicyConfig', {}),
    
    # UNCHANGED: Keep existing topic config
    topicPolicyConfig=current.get('topicPolicyConfig', {}),
    
    blockedInputMessaging=current.get('blockedInputMessaging', ''),
    blockedOutputsMessaging=current.get('blockedOutputsMessaging', '')
)

print(f"Updated content filters only")
print(f"Version: {response['version']}")  # Still DRAFT

# Create numbered version
version = bedrock.create_guardrail_version(
    guardrailIdentifier=guardrail_id,
    description='v2 - Stricter content filters'
)

print(f"Created version: {version['version']}")
