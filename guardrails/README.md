# Bedrock Guardrails Examples

This directory contains examples for creating, updating, and versioning Amazon Bedrock Guardrails using both SDK (boto3) and CDK approaches.

## Overview

Bedrock Guardrails help you implement safeguards for your generative AI applications by:
- Filtering harmful content
- Blocking sensitive information (PII)
- Applying content moderation policies
- Enforcing topic restrictions

## Key Concepts

### Guardrail Lifecycle
1. **Create**: Define policies (content filters, PII redaction, topic denial)
2. **Update**: Modify DRAFT version with UpdateGuardrail
3. **Version**: Create immutable numbered versions from DRAFT
4. **Deploy**: Pin production to specific numbered version

### Versioning Behavior
- **DRAFT**: Mutable working version
  - UpdateGuardrail ALWAYS modifies DRAFT only
  - Never modifies numbered versions
- **Numbered versions** (1, 2, 3...): Immutable production snapshots
  - Created from DRAFT with CreateGuardrailVersion
  - Safe for production pinning
  - Enable rollback to previous versions

### Partial Component Updates
UpdateGuardrail requires ALL fields (changed + unchanged):
1. Fetch current config with GetGuardrail
2. Modify only desired components
3. Send complete config with UpdateGuardrail
4. Create new numbered version
5. Update application to use new version

## Files

- `sdk_create.py` - Create guardrail using boto3
- `sdk_update.py` - Update and version guardrail using boto3
- `sdk_partial_update.py` - Update specific components only
- `versioning_workflow.py` - Complete DRAFT → version → rollback workflow
- `cdk_guardrail.ts` - CDK construct for guardrail deployment
- `usage_example.py` - Apply guardrail with version pinning
- `BLOG_REFERENCES.md` - AWS blog posts and documentation links
- `requirements.txt` - Python dependencies

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Create guardrail
python sdk_create.py

# Update specific components
python sdk_partial_update.py

# Complete versioning workflow
python versioning_workflow.py
```

## Best Practices

1. **Never use DRAFT in production** - Always pin to numbered versions
2. **Test in DRAFT first** - Iterate on DRAFT, then create version
3. **Version on every change** - Create numbered version after each update
4. **Document versions** - Use descriptive version descriptions
5. **Enable rollback** - Keep previous versions for quick rollback
