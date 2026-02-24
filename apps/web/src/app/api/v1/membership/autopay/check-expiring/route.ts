import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, autopayProfiles, customerPaymentMethods } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { buildCardExpiringNotification } from '@oppsera/module-membership';

/**
 * POST /api/v1/membership/autopay/check-expiring
 *
 * Checks for payment methods expiring within 30 days that are linked to active
 * autopay profiles. Returns notification payloads for each expiring card.
 *
 * Designed to be called by a Vercel Cron job weekly.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const now = new Date();
    const thresholdMonth = now.getMonth() + 2; // 0-indexed, +1 for current, +1 for 30d ahead
    const thresholdYear = now.getFullYear() + (thresholdMonth > 12 ? 1 : 0);
    const normalizedMonth = ((thresholdMonth - 1) % 12) + 1;

    // Find active autopay profiles with their payment methods
    const expiringCards = await withTenant(ctx.tenantId, async (tx) => {
      const profiles = await tx
        .select({
          profileId: autopayProfiles.id,
          membershipAccountId: autopayProfiles.membershipAccountId,
          paymentMethodId: autopayProfiles.paymentMethodId,
        })
        .from(autopayProfiles)
        .where(
          and(
            eq(autopayProfiles.tenantId, ctx.tenantId),
            eq(autopayProfiles.isActive, true),
          ),
        );

      const results: Array<{
        membershipAccountId: string;
        customerId: string;
        cardLast4: string;
        expiryMonth: number;
        expiryYear: number;
      }> = [];

      for (const profile of profiles) {
        if (!profile.paymentMethodId) continue;

        const [method] = await tx
          .select({
            customerId: customerPaymentMethods.customerId,
            last4: customerPaymentMethods.last4,
            expiryMonth: customerPaymentMethods.expiryMonth,
            expiryYear: customerPaymentMethods.expiryYear,
          })
          .from(customerPaymentMethods)
          .where(
            and(
              eq(customerPaymentMethods.tenantId, ctx.tenantId),
              eq(customerPaymentMethods.id, profile.paymentMethodId),
              eq(customerPaymentMethods.status, 'active'),
            ),
          )
          .limit(1);

        if (!method || method.expiryMonth == null || method.expiryYear == null) continue;

        // Check if card expires within the threshold window
        const cardExpDate = new Date(method.expiryYear, method.expiryMonth); // first of month AFTER expiry
        const thresholdDate = new Date(thresholdYear, normalizedMonth);

        if (cardExpDate <= thresholdDate) {
          results.push({
            membershipAccountId: profile.membershipAccountId,
            customerId: method.customerId,
            cardLast4: method.last4 ?? '????',
            expiryMonth: method.expiryMonth,
            expiryYear: method.expiryYear,
          });
        }
      }

      return results;
    });

    const notifications = expiringCards.map((card) =>
      buildCardExpiringNotification({
        customerId: card.customerId,
        membershipAccountId: card.membershipAccountId,
        cardLast4: card.cardLast4,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
      }),
    );

    return NextResponse.json({
      data: {
        expiringCount: expiringCards.length,
        notifications,
      },
    });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage', writeAccess: true },
);
