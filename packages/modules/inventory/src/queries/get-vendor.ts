import { eq, and, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { vendors, itemVendors, receivingReceipts } from '@oppsera/db';

export interface VendorDetail {
  id: string;
  name: string;
  nameNormalized: string;
  accountNumber: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  paymentTerms: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  notes: string | null;
  website: string | null;
  defaultPaymentTerms: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Summary stats
  activeCatalogItemCount: number;
  totalReceiptCount: number;
  totalSpend: number;
  lastReceiptDate: string | null;
}

export async function getVendor(tenantId: string, vendorId: string): Promise<VendorDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, tenantId), eq(vendors.id, vendorId)));
    const vendor = rows[0];
    if (!vendor) return null;

    // Count active catalog items
    const catalogResult = await tx.execute(
      sql`SELECT COUNT(*)::int AS count FROM item_vendors
          WHERE tenant_id = ${tenantId} AND vendor_id = ${vendorId} AND is_active = true`,
    );
    const activeCatalogItemCount = (catalogResult as any)[0]?.count ?? 0;

    // Receipt stats (posted only)
    const receiptResult = await tx.execute(
      sql`SELECT COUNT(*)::int AS count,
                 COALESCE(SUM(total::numeric), 0) AS total_spend,
                 MAX(received_date) AS last_date
          FROM receiving_receipts
          WHERE tenant_id = ${tenantId} AND vendor_id = ${vendorId} AND status = 'posted'`,
    );
    const stats = (receiptResult as any)[0];

    return {
      id: vendor.id,
      name: vendor.name,
      nameNormalized: vendor.nameNormalized,
      accountNumber: vendor.accountNumber ?? null,
      contactName: vendor.contactName ?? null,
      contactEmail: vendor.contactEmail ?? null,
      contactPhone: vendor.contactPhone ?? null,
      paymentTerms: vendor.paymentTerms ?? null,
      addressLine1: vendor.addressLine1 ?? null,
      addressLine2: vendor.addressLine2 ?? null,
      city: vendor.city ?? null,
      state: vendor.state ?? null,
      postalCode: vendor.postalCode ?? null,
      country: vendor.country ?? null,
      taxId: vendor.taxId ?? null,
      notes: vendor.notes ?? null,
      website: vendor.website ?? null,
      defaultPaymentTerms: vendor.defaultPaymentTerms ?? null,
      isActive: vendor.isActive,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
      activeCatalogItemCount: Number(activeCatalogItemCount),
      totalReceiptCount: Number(stats?.count ?? 0),
      totalSpend: Number(stats?.total_spend ?? 0),
      lastReceiptDate: stats?.last_date ?? null,
    };
  });
}
