/**
 * PMS-specific event builder helper.
 */
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import type { RequestContext } from '@oppsera/core/auth/context';

export function buildPmsEvent(
  ctx: RequestContext,
  eventType: string,
  data: Record<string, unknown>,
) {
  return buildEventFromContext(ctx, eventType, data);
}
