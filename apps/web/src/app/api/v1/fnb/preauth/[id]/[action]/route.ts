import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { ValidationError, AppError } from '@oppsera/shared';
import {
  capturePreauth,
  capturePreauthSchema,
  voidPreauth,
  voidPreauthSchema,
} from '@oppsera/module-fnb';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

const ACTIONS: Record<string, true> = { capture: true, void: true };

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/fnb/preauth/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const body = await request.json();

    switch (action) {
      case 'capture': {
        const parsed = capturePreauthSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }

        const input = parsed.data;

        // If gateway is configured, look up the preauth's provider_ref and capture on gateway
        if (hasPaymentsGateway()) {
          const preauth = await withTenant(ctx.tenantId, async (tx) => {
            const rows = await tx.execute(
              sql`SELECT provider_ref FROM fnb_tab_preauths
                  WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}`,
            );
            const result = Array.from(rows as Iterable<Record<string, unknown>>);
            return result[0] ?? null;
          });

          if (preauth?.provider_ref) {
            const intent = await withTenant(ctx.tenantId, async (tx) => {
              const rows = await tx.execute(
                sql`SELECT pi.id FROM payment_intents pi
                    JOIN payment_transactions pt ON pt.payment_intent_id = pi.id
                    WHERE pt.provider_ref = ${preauth.provider_ref as string}
                      AND pi.tenant_id = ${ctx.tenantId}
                      AND pi.status = 'authorized'
                    LIMIT 1`,
              );
              const result = Array.from(rows as Iterable<Record<string, unknown>>);
              return result[0] ?? null;
            });

            if (intent?.id) {
              const gateway = getPaymentsGatewayApi();
              const totalCapture = input.captureAmountCents + (input.tipAmountCents ?? 0);
              const gatewayResult = await gateway.capture(ctx, {
                paymentIntentId: intent.id as string,
                amountCents: totalCapture,
                tipCents: input.tipAmountCents,
                clientRequestId: `capture-${input.preauthId}-${Date.now()}`,
              });

              if (gatewayResult.status === 'error') {
                throw new AppError(
                  'CAPTURE_FAILED',
                  gatewayResult.errorMessage ?? 'Failed to capture pre-authorized payment',
                  502,
                );
              }
            }
          }
        }

        const result = await capturePreauth(ctx, ctx.locationId ?? '', parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'void': {
        const parsed = voidPreauthSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }

        const input = parsed.data;

        // If gateway is configured, void the authorization on the gateway (best-effort)
        if (hasPaymentsGateway()) {
          const preauth = await withTenant(ctx.tenantId, async (tx) => {
            const rows = await tx.execute(
              sql`SELECT provider_ref FROM fnb_tab_preauths
                  WHERE id = ${input.preauthId} AND tenant_id = ${ctx.tenantId}
                    AND status = 'authorized'`,
            );
            const result = Array.from(rows as Iterable<Record<string, unknown>>);
            return result[0] ?? null;
          });

          if (preauth?.provider_ref) {
            const intent = await withTenant(ctx.tenantId, async (tx) => {
              const rows = await tx.execute(
                sql`SELECT pi.id FROM payment_intents pi
                    JOIN payment_transactions pt ON pt.payment_intent_id = pi.id
                    WHERE pt.provider_ref = ${preauth.provider_ref as string}
                      AND pi.tenant_id = ${ctx.tenantId}
                      AND pi.status = 'authorized'
                    LIMIT 1`,
              );
              const result = Array.from(rows as Iterable<Record<string, unknown>>);
              return result[0] ?? null;
            });

            if (intent?.id) {
              try {
                const gateway = getPaymentsGatewayApi();
                await gateway.void(ctx, {
                  paymentIntentId: intent.id as string,
                  clientRequestId: `void-preauth-${input.preauthId}-${Date.now()}`,
                });
              } catch {
                // Best-effort: gateway void failure should not block local void
                console.error(`Failed to void gateway authorization for preauth ${input.preauthId}`);
              }
            }
          }
        }

        const result = await voidPreauth(ctx, ctx.locationId ?? '', parsed.data);
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
