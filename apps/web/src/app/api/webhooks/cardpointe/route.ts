import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withTenant, paymentWebhookEvents, paymentProviders, paymentProviderCredentials } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import {
  verifyWebhookSource,
  redactWebhookPayload,
  detectEventType,
  processWebhookEvent,
} from '@oppsera/module-payments';
import type { RequestContext } from '@oppsera/core/auth/context';
import { decryptCredentials } from '@oppsera/module-payments';

/**
 * POST /api/webhooks/cardpointe
 *
 * Webhook receiver for CardPointe payment events.
 * This endpoint is NOT behind standard withMiddleware auth — it uses
 * IP-based verification and shared secrets instead.
 *
 * ALWAYS returns 200 to prevent provider retries of bad data.
 * Failures are logged and stored in the webhook event record.
 *
 * Query params:
 *   tenantId (required) — identifies which tenant this webhook is for
 */
export async function POST(request: NextRequest) {
  const PROVIDER_CODE = 'cardpointe';
  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ received: true, error: 'invalid_json' }, { status: 200 });
  }

  // Extract tenant identifier from query string
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId');

  if (!tenantId) {
    console.error('[webhook/cardpointe] Missing tenantId query param');
    return NextResponse.json({ received: true, error: 'missing_tenant_id' }, { status: 200 });
  }

  // Get source IP from headers (Vercel sets x-forwarded-for)
  const forwarded = request.headers.get('x-forwarded-for');
  const sourceIp = forwarded ? forwarded.split(',')[0]!.trim() : '127.0.0.1';

  // Build headers map for verification
  const headerMap: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headerMap[key.toLowerCase()] = value;
  });

  // Resolve provider config for webhook verification
  let webhookConfig: { allowedIps?: string[]; sharedSecret?: string } | undefined;
  try {
    webhookConfig = await resolveWebhookConfig(tenantId, PROVIDER_CODE);
  } catch (err) {
    console.error('[webhook/cardpointe] Failed to resolve webhook config:', err);
  }

  // Verify webhook source
  const verification = verifyWebhookSource(PROVIDER_CODE, sourceIp, headerMap, webhookConfig);
  if (!verification.valid) {
    console.warn('[webhook/cardpointe] Rejected webhook from IP:', sourceIp, verification.reason);
    // Still return 200 to not leak info to attackers
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Detect event type from payload shape
  const eventType = detectEventType(PROVIDER_CODE, payload);

  // Generate a deterministic event ID for deduplication
  // CardPointe doesn't provide a standard event ID — build one from payload
  const eventId = buildEventId(PROVIDER_CODE, eventType, payload);

  // Log the webhook (redact sensitive fields)
  console.info('[webhook/cardpointe] Received event:', {
    tenantId,
    eventType,
    eventId,
    payload: redactWebhookPayload(payload),
  });

  // Deduplication: check if we've already processed this event
  try {
    const result = await withTenant(tenantId, async (tx) => {
      // Try to insert — unique index prevents duplicates
      const webhookEventId = generateUlid();
      try {
        await tx.insert(paymentWebhookEvents).values({
          id: webhookEventId,
          tenantId,
          providerCode: PROVIDER_CODE,
          eventType,
          eventId,
          payload,
        });
      } catch (insertErr: unknown) {
        // Check for unique constraint violation (already processed)
        const errMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
        if (errMsg.includes('uq_payment_webhooks_tenant_provider_event') || errMsg.includes('duplicate key')) {
          console.info('[webhook/cardpointe] Duplicate event, skipping:', eventId);
          return { duplicate: true };
        }
        throw insertErr;
      }

      // Process the event
      try {
        const ctx: RequestContext = {
          tenantId,
          requestId: `webhook-${webhookEventId}`,
          user: { id: 'system:webhook', email: 'system@webhook' } as RequestContext['user'],
          locationId: undefined,
          isPlatformAdmin: false,
        };

        const processResult = await processWebhookEvent(ctx, {
          eventType,
          providerCode: PROVIDER_CODE,
          tenantId,
          data: payload,
        });

        // Mark as processed
        await tx
          .update(paymentWebhookEvents)
          .set({ processedAt: new Date() })
          .where(eq(paymentWebhookEvents.id, webhookEventId));

        return { duplicate: false, result: processResult };
      } catch (processErr) {
        // Store the error but don't fail the webhook response
        const errorMsg = processErr instanceof Error ? processErr.message : String(processErr);
        await tx
          .update(paymentWebhookEvents)
          .set({ error: errorMsg, processedAt: new Date() })
          .where(eq(paymentWebhookEvents.id, webhookEventId));

        console.error('[webhook/cardpointe] Processing error:', errorMsg);
        return { duplicate: false, error: errorMsg };
      }
    });

    return NextResponse.json({
      received: true,
      eventId,
      ...(result.duplicate ? { status: 'duplicate' } : {}),
    }, { status: 200 });
  } catch (err) {
    // Even DB errors should not cause non-200 responses
    console.error('[webhook/cardpointe] Unexpected error:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve webhook verification config from the provider's credentials.
 * Looks for tenant-wide CardPointe provider + credentials.
 */
async function resolveWebhookConfig(
  tenantId: string,
  providerCode: string,
): Promise<{ allowedIps?: string[]; sharedSecret?: string } | undefined> {
  return withTenant(tenantId, async (tx) => {
    // Find the provider
    const [provider] = await tx
      .select({ id: paymentProviders.id, config: paymentProviders.config })
      .from(paymentProviders)
      .where(
        and(
          eq(paymentProviders.tenantId, tenantId),
          eq(paymentProviders.code, providerCode),
          eq(paymentProviders.isActive, true),
        ),
      )
      .limit(1);

    if (!provider) return undefined;

    // Check provider config for webhook settings
    const providerConfig = provider.config as Record<string, unknown> | null;
    const webhookSecret = providerConfig?.webhookSecret as string | undefined;
    const webhookAllowedIps = providerConfig?.webhookAllowedIps as string[] | undefined;

    // Also check credentials for any webhook-related config
    const [creds] = await tx
      .select({ credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted })
      .from(paymentProviderCredentials)
      .where(
        and(
          eq(paymentProviderCredentials.tenantId, tenantId),
          eq(paymentProviderCredentials.providerId, provider.id),
        ),
      )
      .limit(1);

    let credConfig: Record<string, unknown> | undefined;
    if (creds) {
      try {
        credConfig = decryptCredentials(creds.credentialsEncrypted) as unknown as Record<string, unknown>;
      } catch {
        // Ignore decryption errors — don't block webhook processing
      }
    }

    return {
      sharedSecret: webhookSecret ?? (credConfig?.webhookSecret as string | undefined),
      allowedIps: webhookAllowedIps,
    };
  });
}

/**
 * Build a deterministic event ID for deduplication.
 * CardPointe doesn't provide a standard event identifier, so we construct one
 * from the payload fields.
 */
function buildEventId(
  providerCode: string,
  eventType: string,
  payload: Record<string, unknown>,
): string {
  const parts = [providerCode, eventType];

  // Use identifying fields based on event type
  if (payload.retref) parts.push(String(payload.retref));
  if (payload.caseNumber || payload.caseid) parts.push(String(payload.caseNumber ?? payload.caseid));
  if (payload.batchid) parts.push(String(payload.batchid));
  if (payload.profileid) parts.push(String(payload.profileid));
  if (payload.newtoken) parts.push(String(payload.newtoken).slice(-8)); // last 8 chars only
  if (payload.setlstat) parts.push(String(payload.setlstat));

  // Fallback: use a hash-like approach with amount + date if present
  if (parts.length <= 2) {
    if (payload.amount) parts.push(String(payload.amount));
    if (payload.date) parts.push(String(payload.date));
    // If still no identifying fields, use a timestamp (less ideal for dedup)
    if (parts.length <= 2) parts.push(Date.now().toString());
  }

  return parts.join(':');
}
