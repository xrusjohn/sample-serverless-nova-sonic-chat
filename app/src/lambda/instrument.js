const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');

const sdk = new NodeSDK({
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