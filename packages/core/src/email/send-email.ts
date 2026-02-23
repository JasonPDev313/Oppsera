/**
 * Minimal email service — zero npm dependencies.
 * Uses Resend API via native `fetch` when RESEND_API_KEY is set.
 * Falls back to console.info in dev / when no key is configured.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'noreply@oppsera.com';

  if (!apiKey) {
    console.info('[email] (dev mode — no RESEND_API_KEY)', { to, subject });
    console.info('[email] body:', html);
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    console.error('[email] Resend API error', { status: res.status, body, to, subject });
    throw new Error(`Email send failed: ${res.status}`);
  }
}
