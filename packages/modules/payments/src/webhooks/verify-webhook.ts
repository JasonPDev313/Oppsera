/**
 * Webhook verification for payment provider callbacks.
 *
 * CardPointe uses IP-based authentication for webhooks.
 * The allowed IP ranges are configured per-provider in payment_provider_credentials config.
 *
 * SECURITY: Always verify webhook source before processing.
 */

// CardPointe's documented IP ranges for webhook callbacks
const CARDPOINTE_IP_RANGES = [
  // CardConnect production
  '198.62.138.',
  '206.201.63.',
  '206.201.62.',
  // CardConnect sandbox
  '198.62.139.',
  '206.201.61.',
  // Allow localhost for development
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
];

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify that a webhook request is from an authorized source.
 *
 * For CardPointe:
 * - Check source IP against known CardPointe IP ranges
 * - Check shared secret in X-CardConnect-Secret header (if configured)
 *
 * For future providers:
 * - HMAC signature verification (Stripe-style)
 */
export function verifyWebhookSource(
  providerCode: string,
  sourceIp: string,
  headers: Record<string, string | undefined>,
  config?: { allowedIps?: string[]; sharedSecret?: string },
): WebhookVerificationResult {
  // In development, allow all
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_WEBHOOK_BYPASS === 'true') {
    return { valid: true };
  }

  switch (providerCode) {
    case 'cardpointe':
      return verifyCardPointeWebhook(sourceIp, headers, config);
    default:
      return { valid: false, reason: `Unknown provider: ${providerCode}` };
  }
}

function verifyCardPointeWebhook(
  sourceIp: string,
  headers: Record<string, string | undefined>,
  config?: { allowedIps?: string[]; sharedSecret?: string },
): WebhookVerificationResult {
  // 1. Check shared secret header (if configured)
  if (config?.sharedSecret) {
    const headerSecret = headers['x-cardconnect-secret'] ?? headers['x-webhook-secret'];
    if (headerSecret !== config.sharedSecret) {
      return { valid: false, reason: 'Invalid shared secret' };
    }
    // If secret matches, skip IP check
    return { valid: true };
  }

  // 2. IP-based verification
  const allowedIps = config?.allowedIps ?? [];
  const allAllowed = [...CARDPOINTE_IP_RANGES, ...allowedIps];

  const normalizedIp = normalizeIp(sourceIp);

  const ipMatch = allAllowed.some((allowed) => {
    if (allowed.endsWith('.')) {
      // Prefix match (subnet)
      return normalizedIp.startsWith(allowed);
    }
    return normalizedIp === allowed;
  });

  if (!ipMatch) {
    return { valid: false, reason: `Unauthorized source IP: ${normalizedIp}` };
  }

  return { valid: true };
}

/**
 * Normalize an IP address (strip IPv6-mapped-IPv4 prefix, etc.)
 */
function normalizeIp(ip: string): string {
  // Strip IPv6-mapped IPv4 prefix
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

/**
 * Redact sensitive fields from a webhook payload for logging.
 */
export function redactWebhookPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = ['account', 'token', 'expiry', 'cvv', 'signature', 'pan'];
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (sensitiveFields.includes(key.toLowerCase())) {
      redacted[key] = typeof value === 'string' && value.length > 4
        ? `****${value.slice(-4)}`
        : '****';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactWebhookPayload(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
