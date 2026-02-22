import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import {
  customerEmails,
  customerPhones,
  customerAddresses,
  customerEmergencyContacts,
  customers,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface CustomerContacts360 {
  emails: Array<{
    id: string;
    email: string;
    type: string;
    isPrimary: boolean;
    isVerified: boolean;
    canReceiveStatements: boolean;
    canReceiveMarketing: boolean;
  }>;
  phones: Array<{
    id: string;
    phoneE164: string;
    phoneDisplay: string | null;
    type: string;
    isPrimary: boolean;
    isVerified: boolean;
    canReceiveSms: boolean;
  }>;
  addresses: Array<{
    id: string;
    type: string;
    label: string | null;
    line1: string;
    line2: string | null;
    line3: string | null;
    city: string;
    state: string | null;
    postalCode: string | null;
    county: string | null;
    country: string;
    isPrimary: boolean;
    seasonalStartMonth: number | null;
    seasonalEndMonth: number | null;
  }>;
  emergencyContacts: Array<{
    id: string;
    name: string;
    relationship: string | null;
    phoneE164: string;
    phoneDisplay: string | null;
    email: string | null;
    notes: string | null;
    isPrimary: boolean;
  }>;
}

export interface GetCustomerContacts360Input {
  tenantId: string;
  customerId: string;
}

export async function getCustomerContacts360(
  input: GetCustomerContacts360Input,
): Promise<CustomerContacts360> {
  return withTenant(input.tenantId, async (tx) => {
    // Verify customer exists
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', input.customerId);

    const [emails, phones, addresses, emergencyContactRows] = await Promise.all([
      tx
        .select()
        .from(customerEmails)
        .where(
          and(
            eq(customerEmails.tenantId, input.tenantId),
            eq(customerEmails.customerId, input.customerId),
          ),
        ),
      tx
        .select()
        .from(customerPhones)
        .where(
          and(
            eq(customerPhones.tenantId, input.tenantId),
            eq(customerPhones.customerId, input.customerId),
          ),
        ),
      tx
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.tenantId, input.tenantId),
            eq(customerAddresses.customerId, input.customerId),
          ),
        ),
      tx
        .select()
        .from(customerEmergencyContacts)
        .where(
          and(
            eq(customerEmergencyContacts.tenantId, input.tenantId),
            eq(customerEmergencyContacts.customerId, input.customerId),
          ),
        ),
    ]);

    return {
      emails: emails.map((e) => ({
        id: e.id,
        email: e.email,
        type: e.type,
        isPrimary: e.isPrimary,
        isVerified: e.isVerified,
        canReceiveStatements: e.canReceiveStatements,
        canReceiveMarketing: e.canReceiveMarketing,
      })),
      phones: phones.map((p) => ({
        id: p.id,
        phoneE164: p.phoneE164,
        phoneDisplay: p.phoneDisplay,
        type: p.type,
        isPrimary: p.isPrimary,
        isVerified: p.isVerified,
        canReceiveSms: p.canReceiveSms,
      })),
      addresses: addresses.map((a) => ({
        id: a.id,
        type: a.type,
        label: a.label,
        line1: a.line1,
        line2: a.line2,
        line3: a.line3,
        city: a.city,
        state: a.state,
        postalCode: a.postalCode,
        county: a.county,
        country: a.country,
        isPrimary: a.isPrimary,
        seasonalStartMonth: a.seasonalStartMonth,
        seasonalEndMonth: a.seasonalEndMonth,
      })),
      emergencyContacts: emergencyContactRows.map((c) => ({
        id: c.id,
        name: c.name,
        relationship: c.relationship,
        phoneE164: c.phoneE164,
        phoneDisplay: c.phoneDisplay,
        email: c.email,
        notes: c.notes,
        isPrimary: c.isPrimary,
      })),
    };
  });
}
