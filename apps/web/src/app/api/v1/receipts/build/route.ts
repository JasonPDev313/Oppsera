import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { z } from 'zod';
import { ValidationError } from '@oppsera/shared';
import { buildReceiptDocument, orderForReceiptToInput } from '@oppsera/shared';
import type { ReceiptVariant, LegacyOrderForReceipt, LegacyTenderForReceipt } from '@oppsera/shared';
import { getReceiptSettings } from '@oppsera/core/settings/receipt-settings';
import { getBusinessInfo } from '@oppsera/core/settings/business-info';
import { createReceiptPublicLink } from '@oppsera/core/settings/receipt-links';
import { buildEventFromContext } from '@oppsera/core/events';
import { getEventBus } from '@oppsera/core/events';
import { getOrder, getOrderTenders } from './helpers';

const buildSchema = z.object({
  orderId: z.string().min(1),
  variant: z
    .enum(['standard', 'merchant', 'gift', 'refund', 'reprint', 'training', 'kitchen'])
    .optional()
    .default('standard'),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = buildSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { orderId, variant } = parsed.data;

    // Fetch order, tenders, settings, and business info in parallel
    const [order, tenders, settings, businessInfo] = await Promise.all([
      getOrder(ctx.tenantId, orderId),
      getOrderTenders(ctx.tenantId, orderId),
      getReceiptSettings(ctx.tenantId, ctx.locationId),
      getBusinessInfo(ctx.tenantId),
    ]);

    if (!order) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Order not found' } },
        { status: 404 },
      );
    }

    const businessName = businessInfo.organizationName ?? 'Business';
    const locationName = null; // Resolved from location if needed in future

    const addressLines: string[] = [];
    if (businessInfo.addressLine1) addressLines.push(businessInfo.addressLine1);
    if (businessInfo.addressLine2) addressLines.push(businessInfo.addressLine2);
    if (businessInfo.city || businessInfo.state || businessInfo.postalCode) {
      const cityLine = [businessInfo.city, businessInfo.state]
        .filter(Boolean)
        .join(', ');
      addressLines.push(
        [cityLine, businessInfo.postalCode].filter(Boolean).join(' '),
      );
    }

    const input = orderForReceiptToInput(
      order as LegacyOrderForReceipt,
      businessName,
      locationName ?? '',
      (tenders ?? []) as LegacyTenderForReceipt[],
      settings,
      {
        variant: variant as ReceiptVariant,
        tenantId: ctx.tenantId,
        locationId: ctx.locationId,
        addressLines,
        phone: businessInfo.primaryPhone,
      },
    );

    const document = buildReceiptDocument(input);

    // Auto-generate public receipt link (never blocks POS)
    let receiptToken: string | undefined;
    let lookupCode: string | undefined;
    try {
      if (settings.digitalReceiptEnabled !== false) {
        const link = await createReceiptPublicLink(
          ctx.tenantId,
          orderId,
          document,
          variant,
          settings.digitalReceiptExpiryDays,
        );
        receiptToken = link.token;
        lookupCode = link.lookupCode;

        // Fire-and-forget event (no consumers in V1)
        const event = buildEventFromContext(ctx, 'receipt.link.created.v1', {
          orderId,
          token: link.token,
          lookupCode: link.lookupCode,
          variant,
        });
        getEventBus().publish(event).catch(() => {});
      }
    } catch {
      // Never block POS — link creation failure is non-fatal
    }

    // Rebuild with token so QR URL resolves to digital receipt
    if (receiptToken) {
      const inputWithToken = { ...input, receiptToken };
      const finalDocument = buildReceiptDocument(inputWithToken);
      return NextResponse.json({
        data: finalDocument,
        meta: { receiptToken, lookupCode },
      });
    }

    return NextResponse.json({ data: document });
  },
  { entitlement: 'orders', permission: 'orders.view' },
);
