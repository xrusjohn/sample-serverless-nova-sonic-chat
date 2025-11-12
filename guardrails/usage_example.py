"""
Using a guardrail with Bedrock Converse API
"""
import boto3

bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')

# Use guardrail with specific version
response = bedrock_runtime.converse(
    modelId='us.amazon.nova-pro-v1:0',
    messages=[
        {
            'role': 'user',
            'content': [{'text': 'Tell me about investments'}]
        }
    ],
    
    # Apply guardrail
    guardrailConfig={
        'guardrailIdentifier': 'your-guardrail-id',
        'guardrailVersion': '1',  # or 'DRAFT'
        'trace': 'enabled'  # See what was blocked
    }
)

# Check if guardrail intervened
if response.get('stopReason') == 'guardrail_intervened':
    print("Guardrail blocked the request")
    print(f"Trace: {response.get('trace')}")
else:
    print(response['output']['message']['content'][0]['text'])
