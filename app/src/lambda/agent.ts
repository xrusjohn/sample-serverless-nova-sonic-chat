require('./adot-instrument');

import { mcpConfigSchema } from '@/common/schemas';
import { main } from '../agent';
import { Handler } from 'aws-lambda';
import z from 'zod';
import { trace } from '@opentelemetry/api';

const originalLog = console.log;
console.log = function(...args: any[]) {
  const message = args.join(' ');
  if (!message.includes('audioOutput')) {
    originalLog.apply(console, args);
  }
};

const eventSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  systemPrompt: z.string(),
  voiceId: z.string(),
  mcpConfig: mcpConfigSchema,
});

export const handler: Handler<z.infer<typeof eventSchema>> = async (event, context) => {
  const tracer = trace.getTracer('nova-sonic-agent', '1.0.0');
  
  return tracer.startActiveSpan('nova-sonic-session', async (span) => {
    try {
      console.log(JSON.stringify(event));
      const { sessionId, userId, systemPrompt, voiceId, mcpConfig } = eventSchema.parse(event);
      
      span.setAttributes({
        'nova.session_id': sessionId,
        'nova.user_id': userId,
        'nova.voice_id': voiceId,
        'service.name': 'nova-sonic-agent',
        'service.namespace': 'sonic-chat-app',
      });
      
      await main(sessionId, userId, systemPrompt, voiceId, mcpConfig);
      
      span.setStatus({ code: 1 }); // OK
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      span.end();
    }
  });
};
