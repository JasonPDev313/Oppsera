/**
 * HOST V2: SMS Notification Service.
 *
 * Provider-based abstraction for sending SMS notifications.
 * Console provider for development, Twilio provider for production.
 */

// ── Provider Interface ─────────────────────────────────────────

export interface SmsProvider {
  sendSms(to: string, body: string, from: string): Promise<{ externalId: string; status: string }>;
}

// ── Console Provider (Development) ─────────────────────────────

export class ConsoleSmsProvider implements SmsProvider {
  async sendSms(to: string, body: string, from: string) {
    console.log(`[SMS] To: ${to}, From: ${from}, Body: ${body}`);
    return { externalId: `console_${Date.now()}`, status: 'sent' };
  }
}

// ── Twilio Provider (Production) ───────────────────────────────

export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private accountSid: string,
    private authToken: string,
  ) {}

  async sendSms(to: string, body: string, from: string) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio SMS failed: ${response.status} ${error}`);
    }
    const data = await response.json() as { sid: string; status: string };
    return { externalId: data.sid, status: data.status };
  }
}

// ── Singleton ──────────────────────────────────────────────────

let _smsProvider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!_smsProvider) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    _smsProvider = (sid && token)
      ? new TwilioSmsProvider(sid, token)
      : new ConsoleSmsProvider();
  }
  return _smsProvider;
}

export function setSmsProvider(provider: SmsProvider): void {
  _smsProvider = provider;
}
