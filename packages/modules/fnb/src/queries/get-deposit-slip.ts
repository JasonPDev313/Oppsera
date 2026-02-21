import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetDepositSlipInput } from '../validation';

export interface DepositSlipDetail {
  id: string;
  closeBatchId: string;
  locationId: string;
  depositAmountCents: number;
  depositDate: string;
  bankReference: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  notes: string | null;
}

export async function getDepositSlip(
  input: GetDepositSlipInput,
): Promise<DepositSlipDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT d.id, d.close_batch_id, d.location_id, d.deposit_amount_cents,
                 d.deposit_date, d.bank_reference, d.verified_by, d.verified_at, d.notes
          FROM fnb_deposit_slips d
          JOIN fnb_close_batches b ON b.id = d.close_batch_id
          WHERE d.close_batch_id = ${input.closeBatchId}
            AND b.tenant_id = ${input.tenantId}
          ORDER BY d.created_at DESC
          LIMIT 1`,
    );
    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      id: r.id as string,
      closeBatchId: r.close_batch_id as string,
      locationId: r.location_id as string,
      depositAmountCents: Number(r.deposit_amount_cents),
      depositDate: r.deposit_date as string,
      bankReference: (r.bank_reference as string) ?? null,
      verifiedBy: (r.verified_by as string) ?? null,
      verifiedAt: (r.verified_at as string) ?? null,
      notes: (r.notes as string) ?? null,
    };
  });
}
