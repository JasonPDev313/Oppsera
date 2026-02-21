import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import { FNB_EVENTS } from '../events/types';
import type { TipPoolDistributedPayload } from '../events/types';
import { TipPoolNotFoundError } from '../errors';

interface DistributionParticipant {
  employeeId: string;
  roleId: string;
  hoursWorked: number;
}

interface DistributeTipPoolInput {
  clientRequestId?: string;
  poolId: string;
  businessDate: string;
  participants: DistributionParticipant[];
}

export async function distributeTipPool(
  ctx: RequestContext,
  locationId: string,
  totalPoolAmountCents: number,
  input: DistributeTipPoolInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    if (input.clientRequestId) {
      const check = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'distributeTipPool');
      if (check.isDuplicate) return { result: check.originalResult as any, events: [] };
    }

    // Fetch pool config
    const pools = await tx.execute(
      sql`SELECT id, distribution_method, location_id FROM fnb_tip_pools
          WHERE id = ${input.poolId} AND tenant_id = ${ctx.tenantId}`,
    );
    const poolRows = Array.from(pools as Iterable<Record<string, unknown>>);
    if (poolRows.length === 0) throw new TipPoolNotFoundError(input.poolId);

    const pool = poolRows[0]!;
    const method = pool.distribution_method as string;

    // Fetch participant role points
    const participantRoles = await tx.execute(
      sql`SELECT role_id, points_value, is_recipient FROM fnb_tip_pool_participants
          WHERE pool_id = ${input.poolId} AND tenant_id = ${ctx.tenantId}`,
    );
    const rolePoints = new Map<string, number>();
    for (const r of Array.from(participantRoles as Iterable<Record<string, unknown>>)) {
      if (r.is_recipient) {
        rolePoints.set(r.role_id as string, Number(r.points_value));
      }
    }

    // Calculate distribution based on method
    const distribution = calculateDistribution(
      method,
      totalPoolAmountCents,
      input.participants,
      rolePoints,
    );

    // Insert distribution record
    const rows = await tx.execute(
      sql`INSERT INTO fnb_tip_pool_distributions (tenant_id, pool_id, business_date,
            total_pool_amount_cents, distribution_details, distributed_by)
          VALUES (${ctx.tenantId}, ${input.poolId}, ${input.businessDate},
            ${totalPoolAmountCents}, ${JSON.stringify(distribution)}::jsonb, ${ctx.user.id})
          RETURNING id`,
    );
    const created = Array.from(rows as Iterable<Record<string, unknown>>)[0]!;

    const payload: TipPoolDistributedPayload = {
      distributionId: created.id as string,
      poolId: input.poolId,
      locationId,
      businessDate: input.businessDate,
      totalPoolAmountCents,
      participantCount: distribution.length,
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.TIP_POOL_DISTRIBUTED, payload as unknown as Record<string, unknown>);

    const distResult = {
      id: created.id as string,
      poolId: input.poolId,
      businessDate: input.businessDate,
      totalPoolAmountCents,
      distribution,
    };

    if (input.clientRequestId) {
      await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'distributeTipPool', distResult);
    }

    return { result: distResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.tip_pool.distributed', 'fnb_tip_pool_distributions', result.id);
  return result;
}

interface DistributionEntry {
  employeeId: string;
  roleId: string;
  hoursWorked: number;
  points: number;
  amountCents: number;
}

function calculateDistribution(
  method: string,
  totalCents: number,
  participants: DistributionParticipant[],
  rolePoints: Map<string, number>,
): DistributionEntry[] {
  if (participants.length === 0) return [];

  if (method === 'equal') {
    const perPerson = Math.floor(totalCents / participants.length);
    let remainder = totalCents - perPerson * participants.length;
    return participants.map((p) => {
      const bonus = remainder > 0 ? 1 : 0;
      remainder -= bonus;
      return {
        employeeId: p.employeeId,
        roleId: p.roleId,
        hoursWorked: p.hoursWorked,
        points: 0,
        amountCents: perPerson + bonus,
      };
    });
  }

  if (method === 'points') {
    const weighted = participants.map((p) => ({
      ...p,
      points: (rolePoints.get(p.roleId) ?? 10) * p.hoursWorked,
    }));
    const totalPoints = weighted.reduce((sum, w) => sum + w.points, 0);
    if (totalPoints === 0) {
      // Fallback to equal
      return calculateDistribution('equal', totalCents, participants, rolePoints);
    }
    let distributed = 0;
    return weighted.map((w, i) => {
      const isLast = i === weighted.length - 1;
      const amount = isLast
        ? totalCents - distributed
        : Math.round(totalCents * w.points / totalPoints);
      distributed += amount;
      return {
        employeeId: w.employeeId,
        roleId: w.roleId,
        hoursWorked: w.hoursWorked,
        points: w.points,
        amountCents: amount,
      };
    });
  }

  // Default: hours-based
  const totalHours = participants.reduce((sum, p) => sum + p.hoursWorked, 0);
  if (totalHours === 0) {
    return calculateDistribution('equal', totalCents, participants, rolePoints);
  }
  let distributed = 0;
  return participants.map((p, i) => {
    const isLast = i === participants.length - 1;
    const amount = isLast
      ? totalCents - distributed
      : Math.round(totalCents * p.hoursWorked / totalHours);
    distributed += amount;
    return {
      employeeId: p.employeeId,
      roleId: p.roleId,
      hoursWorked: p.hoursWorked,
      points: 0,
      amountCents: amount,
    };
  });
}
