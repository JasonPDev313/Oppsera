import type { EventEnvelope } from '@oppsera/shared';
import { db, sql } from '@oppsera/db';
import type { Database } from '@oppsera/db';
import type { RequestContext } from '../auth/context';
import { getOutboxWriter } from './index';

export async function publishWithOutbox<T>(
  ctx: RequestContext,
  operation: (tx: Database) => Promise<{
    result: T;
    events: EventEnvelope[];
  }>,
): Promise<T> {
  const outboxWriter = getOutboxWriter();

  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    await tx.execute(sql`SET LOCAL app.current_tenant_id = ${ctx.tenantId}`);
    if (ctx.locationId) {
      await tx.execute(sql`SET LOCAL app.current_location_id = ${ctx.locationId}`);
    }

    const { result, events } = await operation(txDb);

    for (const event of events) {
      await outboxWriter.writeEvent(txDb, event);
    }

    return result;
  });
}
