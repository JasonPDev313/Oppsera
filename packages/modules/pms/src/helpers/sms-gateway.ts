/**
 * SMS gateway abstraction via Twilio.
 * Falls back to console.info in dev when TWILIO_ACCOUNT_SID is missing.
 */

export interface SmsGateway {
  sendSms(to: string, body: string): Promise<{ messageId: string; status: string }>;
}

class DevSmsGateway implements SmsGateway {
  async sendSms(to: string, body: string) {
    console.info(`[DevSMS] To: ${to} | Body: ${body.substring(0, 100)}...`);
    return { messageId: `dev_sms_${Date.now()}`, status: 'sent' };
  }
}

class TwilioSmsGateway implements SmsGateway {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  async sendSms(to: string, body: string) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const params = new URLSearchParams({
      To: to,
      From: this.fromNumber,
      Body: body,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Twilio SMS failed: ${response.status} ${errorBody}`);
    }

    const result = (await response.json()) as { sid: string; status: string };
    return {
      messageId: result.sid,
      status: result.status,
    };
  }
}

let _gateway: SmsGateway | null = null;

export function getSmsGateway(): SmsGateway {
  if (_gateway) return _gateway;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (accountSid && authToken && fromNumber) {
    _gateway = new TwilioSmsGateway(accountSid, authToken, fromNumber);
  } else {
    _gateway = new DevSmsGateway();
  }

  return _gateway;
}
