import { z } from 'zod';

// Define known event schemas
const knownEventSchemas = [
  // event schemas sent from server (btoc, bedrock to client)
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('ready'),
    data: z.object({}),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('audioOutput'),
    data: z.object({
      blobs: z.array(z.string()),
      sequence: z.number(),
    }),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('textStart'),
    data: z.object({
      id: z.string(),
      role: z.string(),
      generationStage: z.string(),
    }),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('textOutput'),
    data: z.object({
      id: z.string(),
      role: z.string(),
      content: z.string(),
    }),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('textStop'),
    data: z.object({
      id: z.string(),
      stopReason: z.string(),
    }),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('audioStop'),
    data: z.object({}),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('end'),
    data: z.object({
      reason: z.string().optional(),
    }),
  }),
  z.object({
    direction: z.literal('btoc'),
    event: z.literal('error'),
    data: z.object({
      message: z.string(),
      type: z.string().optional(),
    }),
  }),

  // event schemas sent from client (ctob, client to bedrock)
  z.object({
    direction: z.literal('ctob'),
    event: z.literal('audioInput'),
    data: z.object({
      blobs: z.array(z.string()),
      sequence: z.number(),
    }),
  }),
  z.object({
    direction: z.literal('ctob'),
    event: z.literal('endAudioInput'),
    data: z.object({}),
  }),
  z.object({
    direction: z.literal('ctob'),
    event: z.literal('terminateSession'),
    data: z.object({}),
  }),
];

// Use union with passthrough to allow unknown events
export const SpeechToSpeechEventSchema = z.union([
  ...knownEventSchemas.map(schema => schema),
  // Catch-all for unknown events
  z.object({
    direction: z.enum(['btoc', 'ctob']),
    event: z.string(),
    data: z.unknown(),
  }).passthrough(),
]);

export type SpeechToSpeechEvent = z.infer<typeof SpeechToSpeechEventSchema>;
export type SpeechToSpeechEventType = SpeechToSpeechEvent['event'];
export type DispatchEventParams = Omit<SpeechToSpeechEvent, 'direction'>;

export const mcpConfigSchema = z.object({
  mcpServers: z.record(
    z.string(),
    z.union([
      z.object({
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string(), z.string()).optional(),
        enabled: z.boolean().optional(),
      }),
      z.object({
        url: z.string(),
        enabled: z.boolean().optional(),
      }),
    ])
  ),
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;
export const EmptyMcpConfig: McpConfig = { mcpServers: {} };
