const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({});

exports.handler = async (event) => {
  console.log('Starting streaming canary test');
  
  const agentFunctionName = process.env.AGENT_FUNCTION_NAME;
  
  try {
    // Test continuous streaming behavior
    const testPayload = {
      sessionId: `streaming-canary-${Date.now()}`,
      action: 'start_streaming',
      audioFiles: ['test-audio-1.wav', 'test-audio-2.wav'],
      silencePadding: 1000
    };
    
    const command = new InvokeCommand({
      FunctionName: agentFunctionName,
      Payload: JSON.stringify(testPayload),
    });
    
    const response = await lambda.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    
    console.log('Streaming canary test completed:', result);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        testType: 'streaming',
        result
      })
    };
    
  } catch (error) {
    console.error('Streaming canary test failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
