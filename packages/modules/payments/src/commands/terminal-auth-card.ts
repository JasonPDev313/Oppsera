import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { paymentIntents, paymentTransactions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { TerminalAuthCardInput } from '../validation/terminal-operations';
import type { PaymentIntentResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS } from '../events/gateway-types';
import { resolveTerminalContext } from '../helpers/resolve-terminal-context';
import { getTerminalSession, invalidateTerminalSession } from '../services/terminal-session-manager';
import { CardPointeTerminalClient, TerminalTimeoutError } from '../providers/cardpointe/terminal-client';
import { normalizeEntryMode } from '../providers/cardpointe/terminal-types';
import { centsToDollars, dollarsToCents, generateProviderOrderId } from '../helpers/amount';

/**
 * Card-present authorization/sale via physical terminal device.
 *
 * Flow:
 * 1. Resolve device + MID + credentials
 * 2. Get/create terminal session
 * 3. Send authCard to physical terminal (user dips/taps/swipes)
 * 4. Record payment_intent + payment_transaction
 * 5. Emit authorization/capture event
 *
 * On timeout: cancel terminal operation → inquire via Gateway API → void if possible
 */
export async function terminalAuthCard(
  ctx: RequestContext,
  input: TerminalAuthCardInput,
): Promise<PaymentIntentResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  // 1. Resolve device + provider + credentials (outside transaction — read-only)
  const termCtx = await resolveTerminalContext(ctx.tenantId, ctx.locationId, input.terminalId);

  // 2. Get terminal session
  const session = await getTerminalSession({
    tenantId: ctx.tenantId,
    hsn: termCtx.device.hsn,
    merchantId: termCtx.merchantId,
    credentials: termCtx.credentials,
  });

  const client = new CardPointeTerminalClient({
    site: termCtx.credentials.site,
    merchantId: termCtx.merchantId,
    username: termCtx.credentials.username,
    password: termCtx.credentials.password,
  });

  const providerOrderId = generateProviderOrderId();

  // 3. Call physical terminal
  let providerRef: string | null = null;
  let txnStatus: 'approved' | 'declined' | 'retry' | 'error' = 'error';
  let authCode: string | null = null;
  let responseCode = '';
  let responseText = '';
  let cardLast4 = '';
  let cardBrand = '';
  let binType: string | null = null;
  let entryMode = '';
  let rawResponse: Record<string, unknown> = {};
  let authorizedAmountCents: number | null = null;
  let capturedAmountCents: number | null = null;
  let token: string | null = null;

  const totalAmountDollars = centsToDollars(input.amountCents);
  const tipDollars = input.tipCents ? centsToDollars(input.tipCents) : undefined;
  const surchargeDollars = input.surchargeAmountCents ? centsToDollars(input.surchargeAmountCents) : undefined;

  try {
    const terminalResponse = await client.authCard(session.sessionKey, {
      hsn: termCtx.device.hsn,
      amount: totalAmountDollars,
      capture: input.capture ?? 'Y',
      orderId: providerOrderId,
      tipAmount: tipDollars,
      surcharge: surchargeDollars,
      includeReceipt: true,
      beep: true,
    });

    providerRef = terminalResponse.retref;
    authCode = terminalResponse.authCode;
    responseCode = terminalResponse.respCode;
    responseText = terminalResponse.respText;
    cardLast4 = terminalResponse.cardLast4;
    cardBrand = terminalResponse.cardBrand;
    binType = terminalResponse.binType ?? null;
    entryMode = terminalResponse.entryMode ?? '';
    token = terminalResponse.token;
    rawResponse = {
      ...terminalResponse,
      emvData: terminalResponse.emvData,
      receipt: terminalResponse.receipt,
      signature: terminalResponse.signature ? '[REDACTED]' : undefined,
    };

    if (terminalResponse.respStat === 'A') {
      txnStatus = 'approved';
      authorizedAmountCents = dollarsToCents(terminalResponse.amount);
      if (input.capture === 'Y') {
        capturedAmountCents = authorizedAmountCents;
      }
    } else if (terminalResponse.respStat === 'C') {
      txnStatus = 'declined';
    } else {
      txnStatus = 'retry';
    }
  } catch (err) {
    if (err instanceof TerminalTimeoutError) {
      // Cancel the terminal operation
      try {
        await client.cancel(session.sessionKey, { hsn: termCtx.device.hsn });
      } catch {
        // Best effort
      }

      // Invalidate session so next attempt reconnects
      invalidateTerminalSession(ctx.tenantId, termCtx.device.hsn);

      txnStatus = 'error';
      responseText = 'Terminal operation timed out — canceled';
    } else {
      txnStatus = 'error';
      responseText = err instanceof Error ? err.message : 'Unknown terminal error';
    }
  }

  // 4. Record in DB
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const [existing] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, ctx.tenantId),
          eq(paymentIntents.idempotencyKey, input.clientRequestId),
        ),
      )
      .limit(1);

    if (existing) {
      return { result: mapIntentToResult(existing, null), events: [] };
    }

    // Create payment intent
    const isCapture = input.capture === 'Y' && txnStatus === 'approved';
    let intentStatus: string;
    let errorMessage: string | null = null;

    if (txnStatus === 'approved') {
      intentStatus = isCapture ? 'captured' : 'authorized';
    } else if (txnStatus === 'declined') {
      intentStatus = 'declined';
      errorMessage = responseText;
    } else {
      intentStatus = 'error';
      errorMessage = responseText;
    }

    const [intent] = await tx
      .insert(paymentIntents)
      .values({
        tenantId: ctx.tenantId,
        locationId: ctx.locationId!,
        providerId: termCtx.device.providerId,
        merchantAccountId: termCtx.merchantAccountId,
        status: intentStatus,
        amountCents: input.amountCents,
        currency: 'USD',
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        providerOrderId,
        paymentMethodType: 'terminal',
        token: token ?? null,
        cardLast4: cardLast4 || null,
        cardBrand: cardBrand || null,
        authorizedAmountCents,
        capturedAmountCents,
        errorMessage,
        metadata: {
          ...(input.metadata ?? {}),
          entryMode: normalizeEntryMode(entryMode),
          binType,
          deviceHsn: termCtx.device.hsn,
          deviceModel: termCtx.device.deviceModel,
          surchargeAmountCents: input.surchargeAmountCents ?? 0,
        },
        idempotencyKey: input.clientRequestId,
        createdBy: ctx.user.id,
      })
      .returning();

    // Insert transaction record
    await tx.insert(paymentTransactions).values({
      tenantId: ctx.tenantId,
      paymentIntentId: intent!.id,
      transactionType: isCapture ? 'sale' : 'authorization',
      providerRef,
      authCode,
      amountCents: input.amountCents,
      responseStatus: txnStatus,
      responseCode: responseCode || null,
      responseText: responseText || null,
      providerResponse: rawResponse,
      clientRequestId: input.clientRequestId,
    });

    // Build event
    const eventType =
      txnStatus === 'approved'
        ? isCapture
          ? PAYMENT_GATEWAY_EVENTS.CAPTURED
          : PAYMENT_GATEWAY_EVENTS.AUTHORIZED
        : PAYMENT_GATEWAY_EVENTS.DECLINED;

    const event = buildEventFromContext(ctx, eventType, {
      paymentIntentId: intent!.id,
      tenantId: ctx.tenantId,
      locationId: ctx.locationId,
      merchantAccountId: termCtx.merchantAccountId,
      amountCents: input.amountCents,
      authorizedAmountCents: authorizedAmountCents ?? 0,
      capturedAmountCents: capturedAmountCents ?? 0,
      currency: 'USD',
      cardLast4,
      cardBrand,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      providerRef,
      paymentMethodType: 'terminal',
      entryMode: normalizeEntryMode(entryMode),
      binType,
      surchargeAmountCents: input.surchargeAmountCents ?? 0,
      responseCode,
      responseText,
    });

    return { result: mapIntentToResult(intent!, providerRef), events: [event] };
  });

  await auditLog(ctx, 'payment.terminal_auth', 'payment_intent', result.id);
  return result;
}

function mapIntentToResult(
  intent: Record<string, any>,
  providerRef: string | null,
): PaymentIntentResult {
  return {
    id: intent.id,
    tenantId: intent.tenantId,
    locationId: intent.locationId,
    status: intent.status,
    amountCents: intent.amountCents,
    currency: intent.currency,
    authorizedAmountCents: intent.authorizedAmountCents ?? null,
    capturedAmountCents: intent.capturedAmountCents ?? null,
    refundedAmountCents: intent.refundedAmountCents ?? null,
    orderId: intent.orderId ?? null,
    customerId: intent.customerId ?? null,
    cardLast4: intent.cardLast4 ?? null,
    cardBrand: intent.cardBrand ?? null,
    providerRef: providerRef ?? null,
    errorMessage: intent.errorMessage ?? null,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}
