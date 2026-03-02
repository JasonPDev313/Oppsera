/**
 * Email template for spa booking cancellation.
 *
 * Sent after a guest cancels their appointment via the manage page.
 * Includes: appointment details, cancellation fee (if any),
 * deposit refund status, and a "Book Again" link.
 */

export interface SpaCancellationEmailData {
  spaName: string;
  logoUrl?: string | null;
  guestName: string;
  appointmentNumber: string;
  serviceName: string;
  providerName?: string | null;
  startAt: Date;
  cancellationFeeCents?: number | null;
  depositRefundCents?: number | null;
  bookAgainUrl: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function spaBookingCancellationEmail(
  data: SpaCancellationEmailData,
): { subject: string; html: string } {
  const feeBlock = data.cancellationFeeCents
    ? `<tr><td style="padding: 6px 0; color: #71717a;">Cancellation Fee</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626;">${formatMoney(data.cancellationFeeCents)}</td></tr>`
    : '';
  const refundBlock = data.depositRefundCents
    ? `<tr><td style="padding: 6px 0; color: #71717a;">Deposit Refund</td><td style="padding: 6px 0; text-align: right; font-weight: 600; color: #16a34a;">${formatMoney(data.depositRefundCents)}</td></tr>`
    : '';
  const logoBlock = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${escapeHtml(data.spaName)}" style="max-height: 48px; margin-bottom: 16px;" />`
    : '';

  return {
    subject: `Appointment Cancelled — ${data.spaName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff;">
  ${logoBlock}
  <h2 style="margin: 0 0 4px; font-size: 22px;">Appointment Cancelled</h2>
  <p style="margin: 0 0 20px; font-size: 15px; color: #71717a;">Confirmation #${escapeHtml(data.appointmentNumber)}</p>

  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin: 0 0 20px;">
    <h3 style="margin: 0 0 12px; font-size: 17px;">${escapeHtml(data.serviceName)}</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0; color: #71717a;">Date</td><td style="padding: 6px 0; text-align: right;">${formatDate(data.startAt)}</td></tr>
      <tr><td style="padding: 6px 0; color: #71717a;">Time</td><td style="padding: 6px 0; text-align: right;">${formatTime(data.startAt)}</td></tr>
      ${data.providerName ? `<tr><td style="padding: 6px 0; color: #71717a;">Provider</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(data.providerName)}</td></tr>` : ''}
      ${feeBlock}
      ${refundBlock}
    </table>
  </div>

  <p style="margin: 0 0 20px; font-size: 14px; color: #71717a;">
    Your appointment has been cancelled. ${data.cancellationFeeCents ? 'The cancellation fee shown above may apply.' : 'No cancellation fee applies.'}
    ${data.depositRefundCents ? ` A refund of ${formatMoney(data.depositRefundCents)} will be processed to your original payment method.` : ''}
  </p>

  <div style="margin: 0 0 20px; text-align: center;">
    <a href="${escapeHtml(data.bookAgainUrl)}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600;">Book Again</a>
  </div>

  <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
    ${escapeHtml(data.spaName)} &mdash; Powered by OppsEra
  </p>
</body>
</html>`.trim(),
  };
}
