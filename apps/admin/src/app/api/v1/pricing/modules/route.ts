import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db, modulePricing } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';

// GET /api/v1/pricing/modules — list module pricing
export const GET = withAdminAuth(async () => {
  const rows = await db.select().from(modulePricing).orderBy(modulePricing.displayName);

  const data = rows.map((r) => ({
    id: r.id,
    moduleKey: r.moduleKey,
    displayName: r.displayName,
    pricePerSeatCents: r.pricePerSeatCents,
    flatFeeCents: r.flatFeeCents,
    isAddon: r.isAddon,
    includedInTiers: r.includedInTiers ?? [],
  }));

  return NextResponse.json({ data });
}, 'viewer');

// PATCH /api/v1/pricing/modules — update a module's pricing (moduleId in body)
export const PATCH = withAdminAuth(async (req: NextRequest) => {
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) {
    return NextResponse.json({ error: { message: 'Missing module pricing id' } }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.pricePerSeatCents !== undefined) updates.pricePerSeatCents = fields.pricePerSeatCents;
  if (fields.flatFeeCents !== undefined) updates.flatFeeCents = fields.flatFeeCents;
  if (fields.isAddon !== undefined) updates.isAddon = fields.isAddon;
  if (fields.includedInTiers !== undefined) updates.includedInTiers = fields.includedInTiers;

  const [updated] = await db
    .update(modulePricing)
    .set(updates)
    .where(eq(modulePricing.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: { message: 'Module pricing not found' } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      moduleKey: updated.moduleKey,
      displayName: updated.displayName,
      pricePerSeatCents: updated.pricePerSeatCents,
      flatFeeCents: updated.flatFeeCents,
      isAddon: updated.isAddon,
      includedInTiers: updated.includedInTiers ?? [],
    },
  });
}, 'super_admin');
