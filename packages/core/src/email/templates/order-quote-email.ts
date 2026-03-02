/**
 * Email template for order quotes / saved carts.
 *
 * Sent from POS when a cashier emails a quote to a customer.
 * Includes: line items, modifiers, totals, business info.
 */

export interface OrderQuoteEmailData {
  businessName: string;
  orderNumber: string;
  customerName?: string | null;
  lines: Array<{
    name: string;
    qty: number;
    unitPriceCents: number;
    extendedPriceCents: number;
    modifiers?: string[];
    notes?: string | null;
  }>;
  subtotalCents: number;
  discountTotalCents: number;
  serviceChargeTotalCents: number;
  taxTotalCents: number;
  totalCents: number;
  notes?: string | null;
  employeeName?: string | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function orderQuoteEmail(
  data: OrderQuoteEmailData,
): { subject: string; html: string } {
  const greeting = data.customerName
    ? `<p style="margin: 0 0 16px; font-size: 15px;">Hi ${escapeHtml(data.customerName)},</p>`
    : '';

  const lineRows = data.lines
    .map(
      (line) => {
        const modLine = line.modifiers?.length
          ? `<br/><span style="color: #71717a; font-size: 12px;">${line.modifiers.map(escapeHtml).join(', ')}</span>`
          : '';
        const noteLine = line.notes
          ? `<br/><span style="font-style: italic; color: #71717a; font-size: 12px;">${escapeHtml(line.notes)}</span>`
          : '';
        return `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; vertical-align: top;">
          <span style="font-size: 14px;">${escapeHtml(line.name)}${modLine}${noteLine}</span>
        </td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; text-align: center; width: 50px; vertical-align: top; font-size: 14px;">${line.qty}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; text-align: right; width: 80px; vertical-align: top; font-size: 14px;">${formatMoney(line.unitPriceCents)}</td>
        <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; text-align: right; width: 90px; vertical-align: top; font-size: 14px; font-weight: 600;">${formatMoney(line.extendedPriceCents)}</td>
      </tr>`;
      },
    )
    .join('');

  const discountRow =
    data.discountTotalCents > 0
      ? `<tr><td colspan="3" style="padding: 4px 0; text-align: right; font-size: 14px; color: #ef4444;">Discount</td><td style="padding: 4px 0; text-align: right; font-size: 14px; color: #ef4444;">-${formatMoney(data.discountTotalCents)}</td></tr>`
      : '';

  const serviceChargeRow =
    data.serviceChargeTotalCents > 0
      ? `<tr><td colspan="3" style="padding: 4px 0; text-align: right; font-size: 14px; color: #71717a;">Service Charge</td><td style="padding: 4px 0; text-align: right; font-size: 14px;">${formatMoney(data.serviceChargeTotalCents)}</td></tr>`
      : '';

  const notesBlock = data.notes
    ? `<div style="margin: 16px 0; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e;">
        <strong>Notes:</strong> ${escapeHtml(data.notes)}
      </div>`
    : '';

  const employeeLine = data.employeeName
    ? `<p style="font-size: 12px; color: #a1a1aa;">Prepared by ${escapeHtml(data.employeeName)}</p>`
    : '';

  return {
    subject: `Quote #${data.orderNumber} from ${data.businessName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff;">
  <h2 style="margin: 0 0 4px; font-size: 22px;">${escapeHtml(data.businessName)}</h2>
  <p style="margin: 0 0 20px; font-size: 15px; color: #71717a;">Quote #${escapeHtml(data.orderNumber)}</p>

  ${greeting}

  <p style="margin: 0 0 20px; font-size: 14px; color: #71717a;">
    Here&rsquo;s the quote you requested. Prices are subject to change.
  </p>

  <table style="width: 100%; border-collapse: collapse;">
    <thead>
      <tr style="border-bottom: 2px solid #e4e4e7;">
        <th style="padding: 8px 0; text-align: left; font-size: 12px; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em;">Item</th>
        <th style="padding: 8px 0; text-align: center; font-size: 12px; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em; width: 50px;">Qty</th>
        <th style="padding: 8px 0; text-align: right; font-size: 12px; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em; width: 80px;">Price</th>
        <th style="padding: 8px 0; text-align: right; font-size: 12px; text-transform: uppercase; color: #71717a; letter-spacing: 0.05em; width: 90px;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
    </tbody>
    <tfoot>
      <tr><td colspan="4" style="padding: 8px 0;"></td></tr>
      <tr>
        <td colspan="3" style="padding: 4px 0; text-align: right; font-size: 14px; color: #71717a;">Subtotal</td>
        <td style="padding: 4px 0; text-align: right; font-size: 14px;">${formatMoney(data.subtotalCents)}</td>
      </tr>
      ${discountRow}
      ${serviceChargeRow}
      <tr>
        <td colspan="3" style="padding: 4px 0; text-align: right; font-size: 14px; color: #71717a;">Tax</td>
        <td style="padding: 4px 0; text-align: right; font-size: 14px;">${formatMoney(data.taxTotalCents)}</td>
      </tr>
      <tr style="border-top: 2px solid #1a1a1a;">
        <td colspan="3" style="padding: 10px 0 4px; text-align: right; font-size: 18px; font-weight: 700;">Total</td>
        <td style="padding: 10px 0 4px; text-align: right; font-size: 18px; font-weight: 700;">${formatMoney(data.totalCents)}</td>
      </tr>
    </tfoot>
  </table>

  ${notesBlock}

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e4e4e7; text-align: center;">
    ${employeeLine}
    <p style="margin: 4px 0 0; font-size: 12px; color: #a1a1aa;">
      ${escapeHtml(data.businessName)} &mdash; Powered by OppsEra
    </p>
  </div>
</body>
</html>`.trim(),
  };
}
