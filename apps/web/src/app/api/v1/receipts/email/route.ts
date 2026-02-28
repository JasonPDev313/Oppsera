import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { z } from 'zod';
import { ValidationError } from '@oppsera/shared';
import { buildReceiptDocument, orderForReceiptToInput, renderEmailReceipt } from '@oppsera/shared';
import type { ReceiptVariant, LegacyOrderForReceipt, LegacyTenderForReceipt } from '@oppsera/shared';
import { getReceiptSettings } from '@oppsera/core/settings/receipt-settings';
import { getBusinessInfo } from '@oppsera/core/settings/business-info';
import { getOrder, getOrderTenders } from '../build/helpers';

const emailSchema = z.object({
  orderId: z.string().min(1),
  email: z.string().email(),
  variant: z
    .enum(['standard', 'gift', 'refund'])
    .optional()
    .default('standard'),
});

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = emailSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { orderId, email, variant } = parsed.data;

    // Fetch order, tenders, settings, and business info in parallel
    const [order, tenderList, settings, businessInfo] = await Promise.all([
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

    if (!settings.emailReceiptEnabled) {
      return NextResponse.json(
        { error: { code: 'DISABLED', message: 'Email receipts are disabled' } },
        { status: 400 },
      );
    }

    const businessName = businessInfo.organizationName ?? 'Business';

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
      '',
      (tenderList ?? []) as LegacyTenderForReceipt[],
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
    const html = renderEmailReceipt(document);

    // V1: Return HTML for caller to send via their email service
    // Future: Integrate with email service (SendGrid, SES, etc.)
    return NextResponse.json({
      data: {
        orderId,
        email,
        variant,
        html,
        subject: `Receipt from ${businessName} - Order #${order.orderNumber}`,
      },
    });
  },
  { entitlement: 'orders', permission: 'orders.view', writeAccess: true },
);
