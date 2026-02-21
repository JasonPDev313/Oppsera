import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { terminalLocations, terminals } from '@oppsera/db';
import { sql } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreateTerminalInput } from '../validation';

export async function createTerminal(
  ctx: RequestContext,
  profitCenterId: string,
  input: CreateTerminalInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Get parent profit center to inherit location_id
    const [profitCenter] = await tx
      .select({
        id: terminalLocations.id,
        locationId: terminalLocations.locationId,
      })
      .from(terminalLocations)
      .where(
        and(
          eq(terminalLocations.tenantId, ctx.tenantId),
          eq(terminalLocations.id, profitCenterId),
          eq(terminalLocations.isActive, true),
        ),
      )
      .limit(1);

    if (!profitCenter) {
      throw new NotFoundError('Profit Center', profitCenterId);
    }

    // Auto-increment terminal number if not provided
    let terminalNumber = input.terminalNumber;
    if (!terminalNumber) {
      const [maxRow] = await tx.execute(
        sql`SELECT COALESCE(MAX(terminal_number), 0) AS max_num
            FROM terminals
            WHERE tenant_id = ${ctx.tenantId}
              AND terminal_location_id = ${profitCenterId}`,
      );
      terminalNumber = (Number((maxRow as Record<string, unknown>)?.max_num) || 0) + 1;
    }

    const [created] = await tx
      .insert(terminals)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        terminalLocationId: profitCenterId,
        locationId: profitCenter.locationId,
        title: input.name,
        terminalNumber,
        deviceIdentifier: input.deviceIdentifier ?? null,
        ipAddress: input.ipAddress ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'platform.terminal.created.v1', {
      terminalId: created!.id,
      profitCenterId,
      locationId: profitCenter.locationId,
      name: input.name,
      terminalNumber,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'platform.terminal.created', 'terminal', result.id);
  return result;
}
