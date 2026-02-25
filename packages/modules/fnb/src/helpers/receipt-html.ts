/**
 * Builds an inline-styled HTML receipt for guest pay.
 * Used by the email-receipt endpoint and can be reused for print.
 * All CSS is inline (email-safe — no <style> blocks or external sheets).
 */

export interface ReceiptLineItem {
  name: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface ReceiptData {
  restaurantName: string | null;
  tableLabel: string | null;
  paidAt: string | null;
  lines: ReceiptLineItem[];
  subtotalCents: number;
  taxCents: number;
  serviceChargeCents: number;
  discountCents: number;
  totalCents: number;
  tipCents: number;
  grandTotalCents: number;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReceiptHtml(data: ReceiptData): string {
  const dateStr = data.paidAt
    ? new Date(data.paidAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

  const lineRows = data.lines
    .map((line) => {
      const qtyLabel = line.qty > 1 ? `${line.qty} x ${fmt(line.unitPriceCents)}` : '';
      return `
      <tr>
        <td style="padding:4px 0;font-size:14px;color:#374151;">
          ${escapeHtml(line.name)}
          ${qtyLabel ? `<br/><span style="font-size:12px;color:#6b7280;">${qtyLabel}</span>` : ''}
        </td>
        <td style="padding:4px 0;font-size:14px;color:#374151;text-align:right;white-space:nowrap;">
          ${fmt(line.lineTotalCents)}
        </td>
      </tr>`;
    })
    .join('');

  const summaryRows: string[] = [];

  summaryRows.push(`
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;">Subtotal</td>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(data.subtotalCents)}</td>
    </tr>`);

  if (data.taxCents > 0) {
    summaryRows.push(`
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;">Tax</td>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(data.taxCents)}</td>
    </tr>`);
  }

  if (data.serviceChargeCents > 0) {
    summaryRows.push(`
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;">Service Charge</td>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(data.serviceChargeCents)}</td>
    </tr>`);
  }

  if (data.discountCents > 0) {
    summaryRows.push(`
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#16a34a;">Discount</td>
      <td style="padding:3px 0;font-size:13px;color:#16a34a;text-align:right;">-${fmt(data.discountCents)}</td>
    </tr>`);
  }

  summaryRows.push(`
    <tr>
      <td style="padding:6px 0 3px;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;">Total</td>
      <td style="padding:6px 0 3px;font-size:14px;font-weight:600;color:#111827;border-top:1px solid #e5e7eb;text-align:right;">${fmt(data.totalCents)}</td>
    </tr>`);

  if (data.tipCents > 0) {
    summaryRows.push(`
    <tr>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;">Tip</td>
      <td style="padding:3px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(data.tipCents)}</td>
    </tr>`);
  }

  summaryRows.push(`
    <tr>
      <td style="padding:8px 0 3px;font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;">Amount Paid</td>
      <td style="padding:8px 0 3px;font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;text-align:right;">${fmt(data.grandTotalCents)}</td>
    </tr>`);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="padding:24px 24px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">
      ${data.restaurantName ? `<h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">${escapeHtml(data.restaurantName)}</h1>` : ''}
      ${data.tableLabel ? `<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">${escapeHtml(data.tableLabel)}</p>` : ''}
      ${dateStr ? `<p style="margin:0;font-size:12px;color:#9ca3af;">${escapeHtml(dateStr)}</p>` : ''}
    </div>

    <!-- Line Items -->
    <div style="padding:16px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${lineRows}
      </table>
    </div>

    <!-- Summary -->
    <div style="padding:0 24px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${summaryRows.join('')}
      </table>
    </div>

    <!-- Footer -->
    <div style="padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb;background:#f9fafb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Powered by OppsEra</p>
    </div>
  </div>
</body>
</html>`;
}
