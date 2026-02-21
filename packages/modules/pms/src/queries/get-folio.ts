import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export async function getFolio(tenantId: string, folioId: string) {
  return withTenant(tenantId, async (tx) => {
    // Get folio
    const folioRows = await tx.execute(sql`
      SELECT f.*, r.check_in_date, r.check_out_date, r.primary_guest_json
      FROM pms_folios f
      LEFT JOIN pms_reservations r ON r.id = f.reservation_id AND r.tenant_id = f.tenant_id
      WHERE f.id = ${folioId} AND f.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const folio = Array.from(folioRows as Iterable<Record<string, unknown>>)[0];
    if (!folio) return null;

    // Get entries
    const entryRows = await tx.execute(sql`
      SELECT id, entry_type, description, amount_cents, source_ref, posted_at, posted_by
      FROM pms_folio_entries
      WHERE folio_id = ${folioId} AND tenant_id = ${tenantId}
      ORDER BY posted_at ASC
    `);
    const entries = Array.from(entryRows as Iterable<Record<string, unknown>>);

    // Calculate running balance
    let runningBalance = 0;
    const entriesWithBalance = entries.map((e) => {
      const amount = Number(e.amount_cents ?? 0);
      runningBalance += amount;
      return {
        id: String(e.id),
        entryType: String(e.entry_type),
        description: String(e.description),
        amountCents: amount,
        sourceRef: e.source_ref ? String(e.source_ref) : null,
        postedAt: String(e.posted_at),
        postedBy: e.posted_by ? String(e.posted_by) : null,
        runningBalanceCents: runningBalance,
      };
    });

    // Payment summary
    const totalCharges = entries
      .filter((e) => !['PAYMENT', 'REFUND'].includes(String(e.entry_type)))
      .reduce((sum, e) => sum + Number(e.amount_cents ?? 0), 0);
    const totalPayments = entries
      .filter((e) => String(e.entry_type) === 'PAYMENT')
      .reduce((sum, e) => sum + Math.abs(Number(e.amount_cents ?? 0)), 0);
    const totalRefunds = entries
      .filter((e) => String(e.entry_type) === 'REFUND')
      .reduce((sum, e) => sum + Math.abs(Number(e.amount_cents ?? 0)), 0);

    return {
      id: String(folio.id),
      reservationId: folio.reservation_id ? String(folio.reservation_id) : null,
      status: String(folio.status),
      subtotalCents: Number(folio.subtotal_cents ?? 0),
      taxCents: Number(folio.tax_cents ?? 0),
      feeCents: Number(folio.fee_cents ?? 0),
      totalCents: Number(folio.total_cents ?? 0),
      checkInDate: folio.check_in_date ? String(folio.check_in_date) : null,
      checkOutDate: folio.check_out_date ? String(folio.check_out_date) : null,
      guestJson: folio.primary_guest_json ?? null,
      entries: entriesWithBalance,
      summary: {
        totalCharges,
        totalPayments,
        totalRefunds,
        balanceDue: totalCharges - totalPayments + totalRefunds,
      },
      createdAt: String(folio.created_at),
    };
  });
}
