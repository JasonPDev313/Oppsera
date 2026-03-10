/**
 * Email a folio to the guest.
 * Generates an HTML folio statement and sends via Resend.
 */
import { sendEmail } from '@oppsera/core/email/send-email';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { ValidationError } from '@oppsera/shared';
import { getFolio } from '../queries/get-folio';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { PMS_EVENTS } from '../events/types';

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildFolioEmailHtml(folio: NonNullable<Awaited<ReturnType<typeof getFolio>>>): string {
  const guest = folio.guestJson as { firstName?: string; lastName?: string } | null;
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(' ') || 'Guest';

  const entryRows = folio.entries.map((e) => {
    const isCredit = e.entryType === 'PAYMENT' || e.entryType === 'REFUND';
    const date = e.businessDate
      ? new Date(e.businessDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
      : '';
    const charge = !isCredit ? formatMoney(Math.abs(e.amountCents)) : '';
    const credit = isCredit ? formatMoney(Math.abs(e.amountCents)) : '';
    const balance = e.runningBalanceCents < 0
      ? `(${formatMoney(Math.abs(e.runningBalanceCents))})`
      : formatMoney(e.runningBalanceCents);

    return `<tr>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;">${date}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;">${escapeHtml(e.description)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right;">${charge}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right;color:#16a34a;">${credit}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5;font-size:12px;text-align:right;font-weight:500;">${balance}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#111;margin:0;padding:0;background:#f5f5f5;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <div style="background:#1e293b;color:#fff;padding:20px 24px;">
    <h1 style="margin:0;font-size:18px;">Guest Folio${folio.folioNumber != null ? ` #${folio.folioNumber}` : ''}</h1>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.8;">${folio.propertyName ?? ''}</p>
  </div>
  <div style="padding:16px 24px;background:#f8fafc;border-bottom:1px solid #e5e5e5;">
    <table style="width:100%;font-size:12px;">
      <tr>
        <td style="padding:2px 0;"><strong>Guest:</strong> ${escapeHtml(guestName)}</td>
        <td style="padding:2px 0;"><strong>Room:</strong> ${folio.roomNumber ?? 'N/A'}${folio.roomTypeName ? ` (${escapeHtml(folio.roomTypeName)})` : ''}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;"><strong>Confirmation:</strong> ${folio.confirmationNumber ?? 'N/A'}</td>
        <td style="padding:2px 0;"><strong>Rate:</strong> ${folio.nightlyRateCents != null ? formatMoney(folio.nightlyRateCents) + '/night' : 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding:2px 0;"><strong>Arrival:</strong> ${folio.checkInDate ? formatDate(folio.checkInDate) : 'N/A'}</td>
        <td style="padding:2px 0;"><strong>Departure:</strong> ${folio.checkOutDate ? formatDate(folio.checkOutDate) : 'N/A'}</td>
      </tr>
    </table>
  </div>
  <div style="padding:0 24px;">
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="border-bottom:2px solid #999;">
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Date</th>
          <th style="padding:6px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Description</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Charges</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Credits</th>
          <th style="padding:6px 8px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#666;">Balance</th>
        </tr>
      </thead>
      <tbody>${entryRows}</tbody>
    </table>
  </div>
  <div style="padding:16px 24px;border-top:2px solid #333;">
    <table style="width:100%;max-width:280px;margin-left:auto;font-size:12px;">
      <tr><td>Subtotal</td><td style="text-align:right;">${formatMoney(folio.subtotalCents)}</td></tr>
      <tr><td>Tax</td><td style="text-align:right;">${formatMoney(folio.taxCents)}</td></tr>
      ${folio.feeCents > 0 ? `<tr><td>Fees</td><td style="text-align:right;">${formatMoney(folio.feeCents)}</td></tr>` : ''}
      <tr><td>Payments</td><td style="text-align:right;color:#16a34a;">(${formatMoney(folio.summary.totalPayments)})</td></tr>
      <tr style="border-top:2px solid #333;font-weight:700;font-size:14px;">
        <td style="padding-top:8px;">Balance Due</td>
        <td style="padding-top:8px;text-align:right;color:${folio.summary.balanceDue > 0 ? '#dc2626' : '#16a34a'};">${formatMoney(Math.abs(folio.summary.balanceDue))}</td>
      </tr>
    </table>
  </div>
  <div style="padding:12px 24px;background:#f8fafc;font-size:10px;color:#999;text-align:center;">
    This is an automatically generated folio statement. Please contact the front desk with any questions.
  </div>
</div>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function emailFolio(
  ctx: RequestContext,
  folioId: string,
  recipientEmail: string,
) {
  // Fetch folio data
  const folio = await getFolio(ctx.tenantId, folioId);
  if (!folio) throw new ValidationError('Folio not found', [{ field: 'folioId', message: 'Folio not found' }]);

  const subject = `Guest Folio${folio.folioNumber != null ? ` #${folio.folioNumber}` : ''} — ${folio.propertyName ?? 'Your Stay'}`;
  const html = buildFolioEmailHtml(folio);

  // Send email first — if this fails, we never write the audit record
  await sendEmail(recipientEmail, subject, html);

  // Audit + event are transactional with each other via outbox
  await publishWithOutbox(ctx, async (tx) => {
    await pmsAuditLogEntry(tx, ctx, folio.propertyId, 'folio', folioId, 'emailed', {
      recipientEmail,
      folioNumber: folio.folioNumber,
    });
    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_EMAILED, {
      folioId,
      recipientEmail,
      folioNumber: folio.folioNumber,
    });
    return { result: { folioId, emailedTo: recipientEmail }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.folio.emailed', 'pms_folio', folioId);
  return { folioId, emailedTo: recipientEmail };
}
