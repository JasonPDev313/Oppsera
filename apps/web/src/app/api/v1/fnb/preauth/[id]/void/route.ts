import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { hasPaymentsGateway, getPaymentsGatewayApi } from '@oppsera/core/helpers/payments-gateway-api';
import { ValidationError } from '@oppsera/shared';
import { voidPreauth, voidPreauthSchema } from '@oppsera/module-fnb';
import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

// POST /api/v1/fnb/preauth/[id]/void — void a pre-auth (with gateway void when configured)
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
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
        // Look up the payment intent to void on gateway
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

    // Void the preauth in the F&B module (updates status, clears card-on-file flag)
    const result = await voidPreauth(ctx, ctx.locationId ?? '', parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
