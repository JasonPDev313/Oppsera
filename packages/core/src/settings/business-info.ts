import { eq } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { tenantBusinessInfo, tenantContentBlocks } from '@oppsera/db';
import { auditLog } from '../audit';
import type { RequestContext } from '../auth/context';
import type {
  UpdateBusinessInfoInput,
  BusinessInfoData,
  ContentBlockData,
  ContentBlockKey,
} from '@oppsera/shared';

// ── Helpers ──────────────────────────────────────────────────────

function maskTaxId(encrypted: string | null): string | null {
  if (!encrypted) return null;
  // Show last 4 chars, mask the rest
  const len = encrypted.length;
  if (len <= 4) return encrypted;
  return '\u2022'.repeat(len - 4) + encrypted.slice(-4);
}

function mapRowToData(row: typeof tenantBusinessInfo.$inferSelect): BusinessInfoData {
  return {
    organizationName: row.organizationName,
    timezone: row.timezone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    primaryPhone: row.primaryPhone,
    primaryEmail: row.primaryEmail,
    logoUrl: row.logoUrl,

    accessType: row.accessType,
    servicesOffered: (row.servicesOffered as string[]) ?? [],
    productsOffered: (row.productsOffered as string[]) ?? [],
    rentalsAvailable: row.rentalsAvailable,
    foodAndBeverage: row.foodAndBeverage,
    promotionsDescription: row.promotionsDescription,
    customerAccessPolicy: row.customerAccessPolicy,

    websiteUrl: row.websiteUrl,
    bookingUrl: row.bookingUrl,
    portalUrl: row.portalUrl,
    socialLinks: (row.socialLinks as Record<string, string>) ?? {},

    secondaryPhone: row.secondaryPhone,
    supportEmail: row.supportEmail,
    faxNumber: row.faxNumber,

    industryType: row.industryType,
    businessHours: (row.businessHours as BusinessInfoData['businessHours']) ?? {},
    yearEstablished: row.yearEstablished,
    taxIdMasked: maskTaxId(row.taxIdEncrypted),

    photoGallery: (row.photoGallery as BusinessInfoData['photoGallery']) ?? [],
    promoVideoUrl: row.promoVideoUrl,
  };
}

const EMPTY_DATA: BusinessInfoData = {
  organizationName: null,
  timezone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: 'US',
  primaryPhone: null,
  primaryEmail: null,
  logoUrl: null,

  accessType: null,
  servicesOffered: [],
  productsOffered: [],
  rentalsAvailable: null,
  foodAndBeverage: null,
  promotionsDescription: null,
  customerAccessPolicy: null,

  websiteUrl: null,
  bookingUrl: null,
  portalUrl: null,
  socialLinks: {},

  secondaryPhone: null,
  supportEmail: null,
  faxNumber: null,

  industryType: null,
  businessHours: {},
  yearEstablished: null,
  taxIdMasked: null,

  photoGallery: [],
  promoVideoUrl: null,
};

// ── Queries ──────────────────────────────────────────────────────

export async function getBusinessInfo(tenantId: string): Promise<BusinessInfoData> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(tenantBusinessInfo)
      .where(eq(tenantBusinessInfo.tenantId, tenantId))
      .limit(1);

    if (rows.length === 0) return EMPTY_DATA;
    return mapRowToData(rows[0]!);
  });
}

export async function getContentBlocks(tenantId: string): Promise<ContentBlockData[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(tenantContentBlocks)
      .where(eq(tenantContentBlocks.tenantId, tenantId));

    return rows.map((r) => ({
      blockKey: r.blockKey as ContentBlockKey,
      content: r.content,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    }));
  });
}

// ── Commands ─────────────────────────────────────────────────────

export async function updateBusinessInfo(
  ctx: RequestContext,
  input: UpdateBusinessInfoInput,
): Promise<BusinessInfoData> {
  return withTenant(ctx.tenantId, async (tx) => {
    const now = new Date();

    // Build the set of columns to upsert (only include fields that were actually passed)
    const values: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      updatedAt: now,
    };

    // Map each input field
    if (input.organizationName !== undefined) values.organizationName = input.organizationName;
    if (input.timezone !== undefined) values.timezone = input.timezone;
    if (input.addressLine1 !== undefined) values.addressLine1 = input.addressLine1;
    if (input.addressLine2 !== undefined) values.addressLine2 = input.addressLine2;
    if (input.city !== undefined) values.city = input.city;
    if (input.state !== undefined) values.state = input.state;
    if (input.postalCode !== undefined) values.postalCode = input.postalCode;
    if (input.country !== undefined) values.country = input.country;
    if (input.primaryPhone !== undefined) values.primaryPhone = input.primaryPhone;
    if (input.primaryEmail !== undefined) values.primaryEmail = input.primaryEmail;
    if (input.logoUrl !== undefined) values.logoUrl = input.logoUrl;

    if (input.accessType !== undefined) values.accessType = input.accessType;
    if (input.servicesOffered !== undefined) values.servicesOffered = input.servicesOffered;
    if (input.productsOffered !== undefined) values.productsOffered = input.productsOffered;
    if (input.rentalsAvailable !== undefined) values.rentalsAvailable = input.rentalsAvailable;
    if (input.foodAndBeverage !== undefined) values.foodAndBeverage = input.foodAndBeverage;
    if (input.promotionsDescription !== undefined) values.promotionsDescription = input.promotionsDescription;
    if (input.customerAccessPolicy !== undefined) values.customerAccessPolicy = input.customerAccessPolicy;

    if (input.websiteUrl !== undefined) values.websiteUrl = input.websiteUrl;
    if (input.bookingUrl !== undefined) values.bookingUrl = input.bookingUrl;
    if (input.portalUrl !== undefined) values.portalUrl = input.portalUrl;
    if (input.socialLinks !== undefined) values.socialLinks = input.socialLinks;

    if (input.secondaryPhone !== undefined) values.secondaryPhone = input.secondaryPhone;
    if (input.supportEmail !== undefined) values.supportEmail = input.supportEmail;
    if (input.faxNumber !== undefined) values.faxNumber = input.faxNumber;

    if (input.industryType !== undefined) values.industryType = input.industryType;
    if (input.businessHours !== undefined) values.businessHours = input.businessHours;
    if (input.yearEstablished !== undefined) values.yearEstablished = input.yearEstablished;
    if (input.taxId !== undefined) values.taxIdEncrypted = input.taxId; // TODO: encrypt before storing
    if (input.photoGallery !== undefined) values.photoGallery = input.photoGallery;
    if (input.promoVideoUrl !== undefined) values.promoVideoUrl = input.promoVideoUrl;

    // Upsert — one row per tenant
    const { updatedAt: _u, tenantId: _t, ...setValues } = values;
    await tx
      .insert(tenantBusinessInfo)
      .values(values as typeof tenantBusinessInfo.$inferInsert)
      .onConflictDoUpdate({
        target: tenantBusinessInfo.tenantId,
        set: { ...setValues, updatedAt: now },
      });

    await auditLog(ctx, 'settings.business_info.updated', 'tenant_business_info', ctx.tenantId);

    // Re-read and return
    const rows = await tx
      .select()
      .from(tenantBusinessInfo)
      .where(eq(tenantBusinessInfo.tenantId, ctx.tenantId))
      .limit(1);

    return rows.length > 0 ? mapRowToData(rows[0]!) : EMPTY_DATA;
  });
}

export async function updateContentBlock(
  ctx: RequestContext,
  blockKey: ContentBlockKey,
  content: string,
): Promise<ContentBlockData> {
  return withTenant(ctx.tenantId, async (tx) => {
    const now = new Date();

    await tx
      .insert(tenantContentBlocks)
      .values({
        tenantId: ctx.tenantId,
        blockKey,
        content,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [tenantContentBlocks.tenantId, tenantContentBlocks.blockKey],
        set: {
          content,
          updatedBy: ctx.user.id,
          updatedAt: now,
        },
      });

    await auditLog(ctx, `settings.content.${blockKey}.updated`, 'tenant_content_blocks', ctx.tenantId);

    return {
      blockKey,
      content,
      updatedAt: now.toISOString(),
    };
  });
}
