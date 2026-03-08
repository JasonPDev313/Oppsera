import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAdminClient, pmsWaitlistConfig, pmsProperties, pmsRoomTypes } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { resolvePmsTenantBySlug } from '../../../resolve-tenant';

/**
 * GET /api/v1/pms/public/[tenantSlug]/waitlist/config?propertyId=...
 *
 * Public endpoint — returns waitlist branding, form config, and available room types.
 * No authentication required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolvePmsTenantBySlug(tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Property not found' } }, { status: 404 });
  }

  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId');

  const adminDb = createAdminClient();

  // If no propertyId, return list of properties
  if (!propertyId) {
    const properties = await adminDb
      .select({ id: pmsProperties.id, name: pmsProperties.name })
      .from(pmsProperties)
      .where(and(eq(pmsProperties.tenantId, tenant.tenantId), eq(pmsProperties.isActive, true)));

    return NextResponse.json({
      data: {
        tenantName: tenant.tenantName,
        properties: Array.from(properties as Iterable<{ id: string; name: string }>),
      },
    });
  }

  // Get config for this property
  const [config] = await adminDb
    .select()
    .from(pmsWaitlistConfig)
    .where(and(eq(pmsWaitlistConfig.tenantId, tenant.tenantId), eq(pmsWaitlistConfig.propertyId, propertyId)))
    .limit(1);

  if (config && !config.isEnabled) {
    return NextResponse.json({ error: { code: 'DISABLED', message: 'Waitlist is not enabled for this property' } }, { status: 403 });
  }

  // Get room types for the property
  const roomTypes = await adminDb
    .select({
      id: pmsRoomTypes.id,
      name: pmsRoomTypes.name,
      code: pmsRoomTypes.code,
      maxOccupancy: pmsRoomTypes.maxOccupancy,
      maxAdults: pmsRoomTypes.maxAdults,
      description: pmsRoomTypes.description,
    })
    .from(pmsRoomTypes)
    .where(and(eq(pmsRoomTypes.tenantId, tenant.tenantId), eq(pmsRoomTypes.propertyId, propertyId)));

  return NextResponse.json({
    data: {
      tenantName: tenant.tenantName,
      propertyId,
      branding: {
        welcomeHeadline: config?.welcomeHeadline ?? 'Room Waitlist',
        welcomeSubtitle: config?.welcomeSubtitle ?? 'Get notified when your preferred room becomes available.',
        logoUrl: config?.logoUrl ?? null,
        primaryColor: config?.primaryColor ?? '#6366f1',
        secondaryColor: config?.secondaryColor ?? '#3b82f6',
        accentColor: config?.accentColor ?? '#10b981',
        fontFamily: config?.fontFamily ?? 'system-ui, sans-serif',
        footerText: config?.footerText ?? null,
      },
      form: {
        requireEmail: config?.requireEmail ?? true,
        requirePhone: config?.requirePhone ?? false,
        showRates: config?.showRates ?? true,
        maxAdvanceDays: config?.maxAdvanceDays ?? 365,
        termsText: config?.termsText ?? null,
      },
      roomTypes: Array.from(roomTypes as Iterable<{ id: string; name: string; code: string; maxOccupancy: number; maxAdults: number; description: string | null }>),
    },
  });
}
