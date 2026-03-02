import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { sendEmail, orderQuoteEmail } from '@oppsera/core';
import { getOrder } from '@oppsera/module-orders';
import { ValidationError } from '@oppsera/shared';

const emailQuoteSchema = z.object({
  email: z.string().email(),
  businessName: z.string().min(1).max(200),
});

function extractOrderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/orders/:id/email-quote → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// POST /api/v1/orders/:id/email-quote — send quote email for an order
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const orderId = extractOrderId(request);
    const body = await request.json();
    const parsed = emailQuoteSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const order = await getOrder(ctx.tenantId, orderId);

    const { subject, html } = orderQuoteEmail({
      businessName: parsed.data.businessName,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      lines: order.lines.map((l) => ({
        name: l.catalogItemName,
        qty: l.qty,
        unitPriceCents: l.unitPrice,
        extendedPriceCents: l.lineSubtotal,
        modifiers: Array.isArray(l.modifiers)
          ? (l.modifiers as Array<{ name: string }>).map((m) => m.name)
          : undefined,
        notes: l.notes ?? l.specialInstructions ?? null,
      })),
      subtotalCents: order.subtotal,
      discountTotalCents: order.discountTotal,
      serviceChargeTotalCents: order.serviceChargeTotal,
      taxTotalCents: order.taxTotal,
      totalCents: order.total,
      notes: order.notes,
      employeeName: ctx.user?.name ?? null,
    });

    try {
      await sendEmail(parsed.data.email, subject, html);
    } catch (err) {
      console.error('[email-quote] Failed to send:', err);
      return NextResponse.json(
        { error: { code: 'EMAIL_SEND_FAILED', message: 'Failed to send quote email' } },
        { status: 502 },
      );
    }

    return NextResponse.json({ data: { sent: true } });
  },
  { entitlement: 'orders', permission: 'orders.manage' },
);
