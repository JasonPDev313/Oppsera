import { generateUlid } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';
import type { RequestContext } from '../auth/context';

interface BuildEventInput {
  eventType: string;
  tenantId: string;
  locationId?: string;
  actorUserId?: string;
  correlationId?: string;
  data: Record<string, unknown>;
  idempotencyKey?: string;
}

export function buildEvent(input: BuildEventInput): EventEnvelope {
  const eventId = generateUlid();
  return {
    eventId,
    eventType: input.eventType,
    occurredAt: new Date().toISOString(),
    tenantId: input.tenantId,
    locationId: input.locationId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    idempotencyKey:
      input.idempotencyKey ?? `${input.tenantId}:${input.eventType}:${eventId}`,
    data: input.data,
  };
}

export function buildEventFromContext(
  ctx: RequestContext,
  eventType: string,
  data: Record<string, unknown>,
  idempotencyKey?: string,
): EventEnvelope {
  return buildEvent({
    eventType,
    tenantId: ctx.tenantId,
    locationId: ctx.locationId,
    actorUserId: ctx.user.id,
    correlationId: ctx.requestId,
    data,
    idempotencyKey,
  });
}
