import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export async function getFolio(tenantId: string, folioId: string) {
  return withTenant(tenantId, async (tx) => {
    // Get folio with reservation + room + rate + payment method details
    const folioRows = await tx.execute(sql`
      SELECT f.*,
        r.check_in_date, r.check_out_date, r.primary_guest_json,
        r.confirmation_number, r.nightly_rate_cents, r.payment_method_id,
        r.source_type AS reservation_source_type,
        rm.room_number,
        rt.name AS room_type_name,
        rp.name AS rate_plan_name, rp.code AS rate_plan_code,
        p.name AS property_name,
        pm.card_brand, pm.card_last_four, pm.card_exp_month, pm.card_exp_year
      FROM pms_folios f
      LEFT JOIN pms_reservations r ON r.id = f.reservation_id AND r.tenant_id = f.tenant_id
      LEFT JOIN pms_rooms rm ON rm.id = r.room_id AND rm.tenant_id = f.tenant_id
      LEFT JOIN pms_room_types rt ON rt.id = r.room_type_id AND rt.tenant_id = f.tenant_id
      LEFT JOIN pms_rate_plans rp ON rp.id = r.rate_plan_id AND rp.tenant_id = f.tenant_id
      LEFT JOIN pms_properties p ON p.id = f.property_id AND p.tenant_id = f.tenant_id
      LEFT JOIN pms_payment_methods pm ON pm.id = r.payment_method_id AND pm.tenant_id = f.tenant_id
      WHERE f.id = ${folioId} AND f.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const folio = Array.from(folioRows as Iterable<Record<string, unknown>>)[0];
    if (!folio) return null;

    // Get entries with department code, business date, void info, and posted-by user name
    const entryRows = await tx.execute(sql`
      SELECT e.id, e.entry_type, e.description, e.amount_cents, e.source_ref,
        e.department_code, e.business_date, e.posted_at, e.posted_by,
        e.voided_entry_id, e.voided_at, e.voided_by,
        u.full_name AS posted_by_name
      FROM pms_folio_entries e
      LEFT JOIN users u ON u.id = e.posted_by
      WHERE e.folio_id = ${folioId} AND e.tenant_id = ${tenantId}
      ORDER BY e.posted_at ASC
    `);
    const entries = Array.from(entryRows as Iterable<Record<string, unknown>>);

    // Calculate running balance (skip voided entries from balance)
    let runningBalance = 0;
    const entriesWithBalance = entries.map((e) => {
      const amount = Number(e.amount_cents ?? 0);
      const isVoided = !!e.voided_at;
      if (!isVoided) runningBalance += amount;
      return {
        id: String(e.id),
        entryType: String(e.entry_type),
        description: String(e.description),
        amountCents: amount,
        sourceRef: e.source_ref ? String(e.source_ref) : null,
        departmentCode: e.department_code ? String(e.department_code) : null,
        businessDate: e.business_date ? String(e.business_date) : null,
        postedAt: String(e.posted_at),
        postedBy: e.posted_by ? String(e.posted_by) : null,
        postedByName: e.posted_by_name ? String(e.posted_by_name) : null,
        voidedEntryId: e.voided_entry_id ? String(e.voided_entry_id) : null,
        voidedAt: e.voided_at ? String(e.voided_at) : null,
        voidedBy: e.voided_by ? String(e.voided_by) : null,
        isVoided,
        runningBalanceCents: runningBalance,
      };
    });

    // Payment summary (exclude voided entries)
    const activeEntries = entries.filter((e) => !e.voided_at);
    const totalCharges = activeEntries
      .filter((e) => !['PAYMENT', 'REFUND'].includes(String(e.entry_type)))
      .reduce((sum, e) => sum + Number(e.amount_cents ?? 0), 0);
    const totalPayments = activeEntries
      .filter((e) => String(e.entry_type) === 'PAYMENT')
      .reduce((sum, e) => sum + Math.abs(Number(e.amount_cents ?? 0)), 0);
    const totalRefunds = activeEntries
      .filter((e) => String(e.entry_type) === 'REFUND')
      .reduce((sum, e) => sum + Math.abs(Number(e.amount_cents ?? 0)), 0);

    // Payment method on file
    const paymentMethod = folio.card_brand
      ? {
          cardBrand: String(folio.card_brand),
          cardLastFour: folio.card_last_four ? String(folio.card_last_four) : null,
          cardExpMonth: folio.card_exp_month != null ? Number(folio.card_exp_month) : null,
          cardExpYear: folio.card_exp_year != null ? Number(folio.card_exp_year) : null,
        }
      : null;

    return {
      id: String(folio.id),
      folioNumber: folio.folio_number != null ? Number(folio.folio_number) : null,
      label: folio.label ? String(folio.label) : null,
      notes: folio.notes ? String(folio.notes) : null,
      reservationId: folio.reservation_id ? String(folio.reservation_id) : null,
      status: String(folio.status),
      subtotalCents: Number(folio.subtotal_cents ?? 0),
      taxCents: Number(folio.tax_cents ?? 0),
      feeCents: Number(folio.fee_cents ?? 0),
      totalCents: Number(folio.total_cents ?? 0),
      depositHeldCents: Number(folio.deposit_held_cents ?? 0),
      // Reservation details for folio header
      checkInDate: folio.check_in_date ? String(folio.check_in_date) : null,
      checkOutDate: folio.check_out_date ? String(folio.check_out_date) : null,
      guestJson: folio.primary_guest_json ?? null,
      confirmationNumber: folio.confirmation_number ? String(folio.confirmation_number) : null,
      roomNumber: folio.room_number ? String(folio.room_number) : null,
      roomTypeName: folio.room_type_name ? String(folio.room_type_name) : null,
      ratePlanName: folio.rate_plan_name ? String(folio.rate_plan_name) : null,
      ratePlanCode: folio.rate_plan_code ? String(folio.rate_plan_code) : null,
      nightlyRateCents: folio.nightly_rate_cents != null ? Number(folio.nightly_rate_cents) : null,
      propertyId: String(folio.property_id),
      propertyName: folio.property_name ? String(folio.property_name) : null,
      paymentMethod,
      entries: entriesWithBalance,
      summary: {
        totalCharges,
        totalPayments,
        totalRefunds,
        balanceDue: totalCharges - totalPayments - totalRefunds,
      },
      createdAt: String(folio.created_at),
    };
  });
}
