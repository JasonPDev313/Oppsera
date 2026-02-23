import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withTenant, tenants, customers } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { createPortalToken, makeSessionCookie } from '@/lib/portal-auth';

const loginSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid email or tenant' } },
        { status: 400 },
      );
    }

    const { email, tenantSlug } = parsed.data;
    const isDevBypass = process.env.PORTAL_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

    // 1. Resolve tenant from slug
    const { db } = await import('@oppsera/db');
    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Organization not found' } },
        { status: 404 },
      );
    }

    const tenantId = String(tenant.id);

    // 2. Find customer by email within tenant
    const customer = await withTenant(tenantId, async (tx) => {
      const rows = await (tx as any)
        .select({ id: customers.id, email: customers.email })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.email, email.toLowerCase().trim())))
        .limit(1);
      const arr = Array.isArray(rows) ? rows : [];
      return arr.length > 0 ? arr[0] : null;
    });

    // Dev bypass: if customer not found by email, use first customer in tenant
    let resolvedCustomerId = customer ? String(customer.id) : '';
    let resolvedEmail = customer ? String(customer.email) : email;

    if (!customer) {
      if (!isDevBypass) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'No membership account found for this email' } },
          { status: 404 },
        );
      }
      // Dev bypass: pick first customer in tenant so portal shows real data
      const fallback = await withTenant(tenantId, async (tx) => {
        const rows = await (tx as any)
          .select({ id: customers.id, email: customers.email })
          .from(customers)
          .where(eq(customers.tenantId, tenantId))
          .limit(1);
        const arr = Array.isArray(rows) ? rows : [];
        return arr.length > 0 ? arr[0] : null;
      });
      if (fallback) {
        resolvedCustomerId = String(fallback.id);
        resolvedEmail = String(fallback.email);
      } else {
        resolvedCustomerId = 'dev-customer';
      }
    }

    // 3. V1: Generate token directly (V2: send magic link email)
    const token = await createPortalToken({
      customerId: resolvedCustomerId,
      tenantId,
      email: resolvedEmail,
    });

    const cookie = makeSessionCookie(token);
    const response = NextResponse.json({ data: { success: true } });
    response.cookies.set(cookie.name, cookie.value, cookie.options as any);
    return response;
  } catch (err: any) {
    console.error('Portal login error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Login failed' } },
      { status: 500 },
    );
  }
}
