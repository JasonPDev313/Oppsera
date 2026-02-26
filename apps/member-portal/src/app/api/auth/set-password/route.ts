import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, withTenant, tenants, customers, customerAuthAccounts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';

const setPasswordSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(1),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/**
 * Admin endpoint to set/reset a customer's portal password.
 * Protected by PORTAL_ADMIN_SECRET header — not cookie-based.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify admin secret
    const adminSecret = process.env.PORTAL_ADMIN_SECRET;
    if (!adminSecret || adminSecret.length < 16) {
      return NextResponse.json(
        { error: { code: 'CONFIG_ERROR', message: 'PORTAL_ADMIN_SECRET not configured' } },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('x-admin-secret');
    if (authHeader !== adminSecret) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid admin secret' } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input' } },
        { status: 400 },
      );
    }

    const { email, tenantSlug, password } = parsed.data;

    // 1. Resolve tenant
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

    // 2. Find customer by email
    const customer = await withTenant(tenantId, async (tx) => {
      const rows = await (tx as any)
        .select({ id: customers.id, email: customers.email, displayName: customers.displayName })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.email, email.toLowerCase().trim())))
        .limit(1);
      const arr = Array.isArray(rows) ? rows : [];
      return arr.length > 0 ? arr[0] : null;
    });

    if (!customer) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Customer not found with that email' } },
        { status: 404 },
      );
    }

    const customerId = String(customer.id);

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // 4. Upsert customer_auth_accounts (provider = 'portal')
    const existing = await withTenant(tenantId, async (tx) => {
      const rows = await (tx as any)
        .select({ id: customerAuthAccounts.id })
        .from(customerAuthAccounts)
        .where(
          and(
            eq(customerAuthAccounts.tenantId, tenantId),
            eq(customerAuthAccounts.customerId, customerId),
            eq(customerAuthAccounts.provider, 'portal'),
          ),
        )
        .limit(1);
      const arr = Array.isArray(rows) ? rows : [];
      return arr.length > 0 ? arr[0] : null;
    });

    if (existing) {
      // Update existing auth account
      await withTenant(tenantId, async (tx) => {
        await (tx as any)
          .update(customerAuthAccounts)
          .set({ passwordHash, isActive: true })
          .where(eq(customerAuthAccounts.id, existing.id));
      });
    } else {
      // Create new auth account
      await withTenant(tenantId, async (tx) => {
        await (tx as any)
          .insert(customerAuthAccounts)
          .values({
            id: generateUlid(),
            tenantId,
            customerId,
            provider: 'portal',
            passwordHash,
            isActive: true,
          });
      });
    }

    return NextResponse.json({
      data: {
        success: true,
        customerId,
        displayName: String(customer.displayName ?? ''),
        email: String(customer.email),
      },
    });
  } catch (err: unknown) {
    console.error('Set password error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to set password' } },
      { status: 500 },
    );
  }
}
