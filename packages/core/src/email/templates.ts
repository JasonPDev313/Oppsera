/**
 * Email templates for Guest Pay member verification.
 */

export function memberVerificationEmail(
  code: string,
  restaurantName: string,
  tableLabel: string,
): { subject: string; html: string } {
  return {
    subject: `${code} — Your verification code for ${restaurantName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <h2 style="margin: 0 0 16px; font-size: 20px;">Your Verification Code</h2>
  <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 0 0 16px;">
    <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; font-family: monospace;">${code}</span>
  </div>
  <p style="margin: 0 0 8px; font-size: 15px;">
    You're charging a check to your house account at <strong>${restaurantName}</strong>${tableLabel ? `, ${tableLabel}` : ''}.
  </p>
  <p style="margin: 0 0 8px; font-size: 15px;">
    Enter this code on the payment page to confirm.
  </p>
  <p style="margin: 0; font-size: 13px; color: #71717a;">
    This code expires in 10 minutes. If you didn't request this, please ignore this email.
  </p>
</body>
</html>`.trim(),
  };
}
