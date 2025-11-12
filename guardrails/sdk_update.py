"""
Update and version a Bedrock Guardrail using boto3 SDK
"""
import boto3

bedrock = boto3.client('bedrock', region_name='us-east-1')

guardrail_id = 'your-guardrail-id'

# Update guardrail - modifies DRAFT version
response = bedrock.update_guardrail(
    guardrailIdentifier=guardrail_id,
    name='my-guardrail',
    description='Updated content moderation',
    
    # Add stricter content filters
    contentPolicyConfig={
        'filtersConfig': [
            {'type': 'HATE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'VIOLENCE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},  # Changed
            {'type': 'SEXUAL', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'MISCONDUCT', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},  # Changed
            {'type': 'INSULTS', 'inputStrength': 'MEDIUM', 'outputStrength': 'MEDIUM'},  # New
        ]
    },
    
    # Keep existing PII config
    sensitiveInformationPolicyConfig={
        'piiEntitiesConfig': [
            {'type': 'EMAIL', 'action': 'BLOCK'},
            {'type': 'PHONE', 'action': 'ANONYMIZE'},
            {'type': 'CREDIT_DEBIT_CARD_NUMBER', 'action': 'BLOCK'},
            {'type': 'US_SOCIAL_SECURITY_NUMBER', 'action': 'BLOCK'},
        ]
    },
    
    blockedInputMessaging='Sorry, I cannot process that request.',
    blockedOutputsMessaging='I cannot provide that information.'
)

print(f"Updated guardrail: {response['guardrailId']}")
print(f"Version: {response['version']}")  # Still 'DRAFT'

# Create numbered version from DRAFT
version_response = bedrock.create_guardrail_version(
    guardrailIdentifier=guardrail_id,
    description='Production release v1 - stricter filters'
)

print(f"\nCreated version: {version_response['version']}")  # '1', '2', etc.

# List all versions
versions = bedrock.list_guardrails(
    guardrailIdentifier=guardrail_id
)

print("\nAll versions:")
for v in versions.get('guardrails', []):
    print(f"  Version {v['version']}: {v.get('description', 'N/A')}")

# Get specific version details
version_detail = bedrock.get_guardrail(
    guardrailIdentifier=guardrail_id,
    guardrailVersion='1'  # or 'DRAFT'
)

print(f"\nVersion 1 details:")
print(f"  Status: {version_detail['status']}")
print(f"  Created: {version_detail['createdAt']}")
