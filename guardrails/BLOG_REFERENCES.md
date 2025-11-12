# AWS Blog References for Bedrock Guardrails

## Key Blog Posts

### 1. Build Responsible AI Applications with Amazon Bedrock Guardrails
**URL**: https://aws.amazon.com/blogs/machine-learning/build-responsible-ai-applications-with-amazon-bedrock-guardrails/

**Highlights**:
- Healthcare insurance use case example
- Multimodal content filters (text + images)
- Denied topics configuration
- Contextual grounding checks for hallucination detection
- Automated reasoning checks for logical validation
- ApplyGuardrail API for custom/third-party models

### 2. Automate Building Guardrails Using Test-Driven Development
**URL**: https://aws.amazon.com/blogs/machine-learning/automate-building-guardrails-for-amazon-bedrock-using-test-driven-development/

**Highlights**:
- Test-driven development (TDD) approach for guardrails
- CSV-based testing dataset structure
- ApplyGuardrail API for evaluation
- Automated guardrail refinement workflow
- Math tutoring guardrail example

### 3. Improve LLM Application Robustness with Guardrails and Agents
**URL**: https://aws.amazon.com/blogs/machine-learning/improve-llm-application-robustness-with-amazon-bedrock-guardrails-and-amazon-bedrock-agents/

**Highlights**:
- Agentic workflows with Amazon Bedrock Agents
- Online retail chatbot use case
- Adversarial robustness testing
- Word and phrase filters
- Sensitive word filters
- Cost considerations

### 4. Implementing Safety Guardrails for SageMaker Applications
**URL**: https://aws.amazon.com/blogs/security/implementing-safety-guardrails-for-applications-using-amazon-sagemaker/

**Highlights**:
- Pre-deployment vs runtime interventions
- ApplyGuardrail API with SageMaker endpoints
- Llama Guard as external guardrail
- Constitutional AI approaches
- Bias and fairness assessments

## Official Documentation

### Core Guardrails Documentation
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html

**Features**:
- Content filters (6 categories: Hate, Insults, Sexual, Violence, Misconduct, Prompt Attacks)
- Denied topics
- Word filters
- Sensitive information filters (PII redaction)
- Contextual grounding checks
- Automated reasoning checks

### Use Cases Documentation
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-use.html

**Applications**:
- Model inference
- Agents
- Knowledge bases
- Flow nodes

### How Guardrails Work
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-how.html

**Key Points**:
- Parallel policy evaluation
- Input and response evaluation
- Pricing model (pay per policy configured)
- No FM charges if input blocked

## Integration Examples

### With Flows
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/flows-guardrails.html
- Prompt node integration
- Knowledge base node integration

### With Inference Operations
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-input-tagging-base-inference.html
- InvokeModel API
- InvokeModelWithResponseStream API
- Converse API
- Selective input evaluation
- Streaming response configuration

## Versioning and Component Updates

### Create Guardrail Versions
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-versions-create.html

**Key Concepts**:
- **DRAFT version**: Mutable working version, updated with each UpdateGuardrail call
- **Numbered versions** (1, 2, 3...): Immutable snapshots created from DRAFT
- CreateGuardrailVersion creates numbered version from current DRAFT state
- Numbered versions never change - safe for production pinning

### Modify Guardrails
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-edit.html

**Update Behavior**:
- UpdateGuardrail ALWAYS modifies DRAFT version only
- Must include ALL fields (changed + unchanged) in update request
- To update specific components: fetch current config, modify desired fields, send full config
- After update, create new numbered version for production use

**Partial Update Pattern**:
1. Get current DRAFT configuration with GetGuardrail
2. Modify only the components you want to change
3. Send UpdateGuardrail with modified + unchanged fields
4. Create new numbered version from updated DRAFT
5. Update application to use new version number

### View Guardrail Versions
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-versions-view.html
- List all versions with ListGuardrails
- Get specific version details with GetGuardrail
- Compare versions to understand changes

### Version Enforcement
**URL**: https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-permissions-id.html
- Use IAM policies to enforce specific guardrail versions
- Prevent use of DRAFT in production
- Control which versions can be used per environment
