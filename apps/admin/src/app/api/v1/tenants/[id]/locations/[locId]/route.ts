import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import { locations } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export const PATCH = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  const locId = params?.locId;
  if (!tenantId || !locId) {
    return NextResponse.json({ error: { message: 'Missing tenant or location ID' } }, { status: 400 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.addressLine1 !== undefined) updates.addressLine1 = body.addressLine1;
  if (body.city !== undefined) updates.city = body.city;
  if (body.state !== undefined) updates.state = body.state;
  if (body.postalCode !== undefined) updates.postalCode = body.postalCode;
  if (body.country !== undefined) updates.country = body.country;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.email !== undefined) updates.email = body.email;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: { message: 'No fields to update' } }, { status: 400 });
  }

  const [updated] = await db
    .update(locations)
    .set(updates)
    .where(and(eq(locations.id, locId), eq(locations.tenantId, tenantId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: { message: 'Location not found' } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      name: updated.name,
      locationType: updated.locationType,
      isActive: updated.isActive,
    },
  });
}, 'admin');
