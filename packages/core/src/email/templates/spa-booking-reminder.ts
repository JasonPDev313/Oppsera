/**
 * Email template for spa booking reminder.
 *
 * Sent 24 hours before the appointment (configurable).
 * Includes: appointment details, manage link, calendar links,
 * and an optional welcome/preparation message.
 */

export interface SpaReminderEmailData {
  spaName: string;
  logoUrl?: string | null;
  guestName: string;
  appointmentNumber: string;
  serviceName: string;
  providerName?: string | null;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  manageUrl: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
  welcomeMessage?: string | null;
  cancellationWindowHours?: number | null;
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function spaBookingReminderEmail(
  data: SpaReminderEmailData,
): { subject: string; html: string } {
  const logoBlock = data.logoUrl
    ? `<img src="${escapeHtml(data.logoUrl)}" alt="${escapeHtml(data.spaName)}" style="max-height: 48px; margin-bottom: 16px;" />`
    : '';
  const welcomeBlock = data.welcomeMessage
    ? `<p style="margin: 0 0 16px; font-size: 14px; color: #71717a;">${escapeHtml(data.welcomeMessage)}</p>`
    : '';
  const cancelNote = data.cancellationWindowHours
    ? `<p style="margin: 0 0 16px; font-size: 13px; color: #71717a;">Need to cancel or reschedule? Please do so at least ${data.cancellationWindowHours} hours before your appointment to avoid any fees.</p>`
    : '';

  return {
    subject: `Reminder: ${data.serviceName} Tomorrow at ${data.spaName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #ffffff;">
  ${logoBlock}
  <h2 style="margin: 0 0 4px; font-size: 22px;">Your Appointment is Tomorrow</h2>
  <p style="margin: 0 0 20px; font-size: 15px; color: #71717a;">Hi ${escapeHtml(data.guestName)}, just a friendly reminder about your upcoming appointment.</p>
  ${welcomeBlock}

  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 0 0 20px;">
    <h3 style="margin: 0 0 12px; font-size: 17px;">${escapeHtml(data.serviceName)}</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0; color: #71717a;">Date</td><td style="padding: 6px 0; text-align: right;">${formatDate(data.startAt)}</td></tr>
      <tr><td style="padding: 6px 0; color: #71717a;">Time</td><td style="padding: 6px 0; text-align: right;">${formatTime(data.startAt)} &ndash; ${formatTime(data.endAt)}</td></tr>
      <tr><td style="padding: 6px 0; color: #71717a;">Duration</td><td style="padding: 6px 0; text-align: right;">${data.durationMinutes} min</td></tr>
      ${data.providerName ? `<tr><td style="padding: 6px 0; color: #71717a;">Provider</td><td style="padding: 6px 0; text-align: right;">${escapeHtml(data.providerName)}</td></tr>` : ''}
    </table>
  </div>

  ${cancelNote}

  <div style="margin: 0 0 20px; text-align: center;">
    <a href="${escapeHtml(data.manageUrl)}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600;">Manage Appointment</a>
  </div>

  <div style="margin: 0 0 20px; text-align: center; font-size: 13px;">
    <span style="color: #71717a;">Add to calendar: </span>
    <a href="${escapeHtml(data.googleCalendarUrl)}" style="color: #4f46e5; text-decoration: none; margin: 0 6px;">Google</a>
    <span style="color: #d4d4d8;">|</span>
    <a href="${escapeHtml(data.outlookCalendarUrl)}" style="color: #4f46e5; text-decoration: none; margin: 0 6px;">Outlook</a>
  </div>

  <p style="margin: 0; font-size: 12px; color: #a1a1aa; text-align: center;">
    ${escapeHtml(data.spaName)} &mdash; Powered by OppsEra
  </p>
</body>
</html>`.trim(),
  };
}
