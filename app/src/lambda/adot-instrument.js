const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'nova-sonic-agent',
    [ATTR_SERVICE_NAMESPACE]: 'sonic-chat-app',
  }),
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-aws-lambda': {
      disableAwsContextPropagation: false,
    },
    '@opentelemetry/instrumentation-aws-sdk': {
      suppressInternalInstrumentation: false,
    },
  })],
});

sdk.start();