import { eq, and } from 'drizzle-orm';
import { withTenant, pmsWaitlistConfig } from '@oppsera/db';

export interface WaitlistConfigDetail {
  id: string;
  propertyId: string;
  isEnabled: boolean;
  offerExpiryHours: number;
  maxOffersPerSlot: number;
  autoOfferEnabled: boolean;
  welcomeHeadline: string;
  welcomeSubtitle: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  footerText: string | null;
  requireEmail: boolean;
  requirePhone: boolean;
  showRates: boolean;
  maxAdvanceDays: number;
  termsText: string | null;
  offerSmsTemplate: string | null;
  offerEmailSubject: string | null;
  offerEmailTemplate: string | null;
  confirmationTemplate: string | null;
}

/** Returns config for a property, or sensible defaults if none exists */
export async function getWaitlistConfig(input: {
  tenantId: string;
  propertyId: string;
}): Promise<WaitlistConfigDetail> {
  return withTenant(input.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pmsWaitlistConfig)
      .where(
        and(
          eq(pmsWaitlistConfig.tenantId, input.tenantId),
          eq(pmsWaitlistConfig.propertyId, input.propertyId),
        ),
      )
      .limit(1);

    if (row) {
      return {
        id: row.id,
        propertyId: row.propertyId,
        isEnabled: row.isEnabled,
        offerExpiryHours: row.offerExpiryHours,
        maxOffersPerSlot: row.maxOffersPerSlot,
        autoOfferEnabled: row.autoOfferEnabled,
        welcomeHeadline: row.welcomeHeadline,
        welcomeSubtitle: row.welcomeSubtitle,
        logoUrl: row.logoUrl,
        primaryColor: row.primaryColor,
        secondaryColor: row.secondaryColor,
        accentColor: row.accentColor,
        fontFamily: row.fontFamily,
        footerText: row.footerText,
        requireEmail: row.requireEmail,
        requirePhone: row.requirePhone,
        showRates: row.showRates,
        maxAdvanceDays: row.maxAdvanceDays,
        termsText: row.termsText,
        offerSmsTemplate: row.offerSmsTemplate,
        offerEmailSubject: row.offerEmailSubject,
        offerEmailTemplate: row.offerEmailTemplate,
        confirmationTemplate: row.confirmationTemplate,
      };
    }

    // Return defaults
    return {
      id: '',
      propertyId: input.propertyId,
      isEnabled: true,
      offerExpiryHours: 24,
      maxOffersPerSlot: 3,
      autoOfferEnabled: false,
      welcomeHeadline: 'Room Waitlist',
      welcomeSubtitle: 'Get notified when your preferred room becomes available.',
      logoUrl: null,
      primaryColor: '#6366f1',
      secondaryColor: '#3b82f6',
      accentColor: '#10b981',
      fontFamily: 'system-ui, sans-serif',
      footerText: null,
      requireEmail: true,
      requirePhone: false,
      showRates: true,
      maxAdvanceDays: 365,
      termsText: null,
      offerSmsTemplate: null,
      offerEmailSubject: 'Great news — your room is available!',
      offerEmailTemplate: null,
      confirmationTemplate: null,
    };
  });
}
