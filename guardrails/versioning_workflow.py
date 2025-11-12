"""
Complete versioning workflow: DRAFT → numbered versions → rollback
"""
import boto3

bedrock = boto3.client('bedrock', region_name='us-east-1')

guardrail_id = 'your-guardrail-id'

# Step 1: Update DRAFT (always modifies DRAFT, never numbered versions)
print("Step 1: Updating DRAFT...")
bedrock.update_guardrail(
    guardrailIdentifier=guardrail_id,
    name='my-guardrail',
    contentPolicyConfig={
        'filtersConfig': [
            {'type': 'HATE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
        ]
    },
    blockedInputMessaging='Blocked',
    blockedOutputsMessaging='Blocked'
)

# Step 2: Create version 1 from DRAFT
print("Step 2: Creating version 1...")
v1 = bedrock.create_guardrail_version(
    guardrailIdentifier=guardrail_id,
    description='Initial production release'
)
print(f"  Created version: {v1['version']}")

# Step 3: Update DRAFT again (v1 remains unchanged)
print("Step 3: Updating DRAFT with new filters...")
bedrock.update_guardrail(
    guardrailIdentifier=guardrail_id,
    name='my-guardrail',
    contentPolicyConfig={
        'filtersConfig': [
            {'type': 'HATE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},
            {'type': 'VIOLENCE', 'inputStrength': 'HIGH', 'outputStrength': 'HIGH'},  # Added
        ]
    },
    blockedInputMessaging='Blocked',
    blockedOutputsMessaging='Blocked'
)

# Step 4: Create version 2 from updated DRAFT
print("Step 4: Creating version 2...")
v2 = bedrock.create_guardrail_version(
    guardrailIdentifier=guardrail_id,
    description='Added violence filter'
)
print(f"  Created version: {v2['version']}")

# Step 5: Use specific version in production
print("\nStep 5: Using version 2 in production...")
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')
response = bedrock_runtime.converse(
    modelId='us.amazon.nova-pro-v1:0',
    messages=[{'role': 'user', 'content': [{'text': 'Hello'}]}],
    guardrailConfig={
        'guardrailIdentifier': guardrail_id,
        'guardrailVersion': '2'  # Pin to version 2
    }
)

# Step 6: Rollback to version 1 if needed
print("\nStep 6: Rolling back to version 1...")
response = bedrock_runtime.converse(
    modelId='us.amazon.nova-pro-v1:0',
    messages=[{'role': 'user', 'content': [{'text': 'Hello'}]}],
    guardrailConfig={
        'guardrailIdentifier': guardrail_id,
        'guardrailVersion': '1'  # Rollback to v1
    }
)

# Step 7: List all versions
print("\nStep 7: All versions:")
versions = bedrock.list_guardrails(guardrailIdentifier=guardrail_id)
for v in versions.get('guardrails', []):
    print(f"  Version {v['version']}: {v.get('description', 'N/A')}")
