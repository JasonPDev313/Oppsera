import { z } from 'zod';

export const EventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().regex(/^[a-z]+\.[a-z_]+\.[a-z]+\.v\d+$/),
  occurredAt: z.string().datetime(),
  tenantId: z.string().min(1),
  locationId: z.string().optional(),
  actorUserId: z.string().optional(),
  idempotencyKey: z.string().min(1),
  correlationId: z.string().optional(),
  data: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
