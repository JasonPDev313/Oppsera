import { z } from 'zod';

// ── Enums ────────────────────────────────────────────────────────

export const ACCESS_TYPES = ['public', 'private', 'members_only', 'appointment_only', 'hybrid'] as const;
export const RENTAL_TYPES = ['none', 'equipment', 'space', 'vehicles', 'multiple'] as const;
export const FNB_LEVELS = ['none', 'vending_only', 'limited_menu', 'full_service', 'catering'] as const;
export const INDUSTRY_TYPES = [
  'retail', 'restaurant', 'hotel', 'spa', 'golf_club',
  'fitness', 'entertainment', 'professional_services', 'hybrid', 'other',
] as const;

export const CONTENT_BLOCK_KEYS = ['about', 'services_events', 'promotions', 'team'] as const;
export type ContentBlockKey = (typeof CONTENT_BLOCK_KEYS)[number];

export const SOCIAL_PLATFORMS = [
  'facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok',
  'threads', 'pinterest', 'snapchat', 'google_business', 'whatsapp',
  'yelp', 'tripadvisor',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

// ── Business Hours Schema ────────────────────────────────────────

const timePeriodSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  close: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
});

const dayHoursSchema = z.object({
  closed: z.boolean(),
  periods: z.array(timePeriodSchema).max(3),
});

export const businessHoursSchema = z.object({
  mon: dayHoursSchema.optional(),
  tue: dayHoursSchema.optional(),
  wed: dayHoursSchema.optional(),
  thu: dayHoursSchema.optional(),
  fri: dayHoursSchema.optional(),
  sat: dayHoursSchema.optional(),
  sun: dayHoursSchema.optional(),
});

export type BusinessHours = z.infer<typeof businessHoursSchema>;

// ── Social Links Schema ──────────────────────────────────────────

export const socialLinksSchema = z.record(
  z.enum(SOCIAL_PLATFORMS),
  z.string().url().max(500).or(z.literal('')),
);

export type SocialLinks = z.infer<typeof socialLinksSchema>;

// ── Image URL Schema (accepts both http(s) URLs and data: URLs) ──

const imageUrlSchema = z.string().refine(
  (v) => /^(https?:\/\/|data:image\/)/.test(v),
  'Must be a valid URL or uploaded image',
);

// ── Photo Gallery Item Schema ────────────────────────────────────

export const photoGalleryItemSchema = z.object({
  url: imageUrlSchema,
  caption: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0),
});

// ── Update Business Info Schema ──────────────────────────────────

export const updateBusinessInfoSchema = z.object({
  // Section 1: Business Information
  organizationName: z.string().min(1).max(120).optional(),
  timezone: z.string().min(1).max(100).optional(),
  addressLine1: z.string().max(200).optional().nullable(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().length(2).optional(),
  primaryPhone: z.string().max(30).optional().nullable(),
  primaryEmail: z.string().email().max(254).optional().nullable(),
  logoUrl: imageUrlSchema.optional().nullable(),

  // Section 2: Operations
  accessType: z.enum(ACCESS_TYPES).optional().nullable(),
  servicesOffered: z.array(z.string().min(1).max(60)).max(20).optional(),
  productsOffered: z.array(z.string().min(1).max(60)).max(20).optional(),
  rentalsAvailable: z.enum(RENTAL_TYPES).optional().nullable(),
  foodAndBeverage: z.enum(FNB_LEVELS).optional().nullable(),
  promotionsDescription: z.string().max(500).optional().nullable(),
  customerAccessPolicy: z.string().max(500).optional().nullable(),

  // Section 3: Online Presence
  websiteUrl: z.string().url().max(500).optional().nullable(),
  bookingUrl: z.string().url().max(500).optional().nullable(),
  portalUrl: z.string().url().max(500).optional().nullable(),
  socialLinks: socialLinksSchema.optional(),

  // Section 5: Advanced — Contact Extensions
  secondaryPhone: z.string().max(30).optional().nullable(),
  supportEmail: z.string().email().max(254).optional().nullable(),
  faxNumber: z.string().max(30).optional().nullable(),

  // Section 5: Advanced — Business Metadata
  industryType: z.enum(INDUSTRY_TYPES).optional().nullable(),
  businessHours: businessHoursSchema.optional(),
  yearEstablished: z.number().int().min(1800).max(new Date().getFullYear()).optional().nullable(),
  taxId: z.string().min(2).max(30).optional().nullable(),

  // Section 5: Advanced — Media
  photoGallery: z.array(photoGalleryItemSchema).max(20).optional(),
  promoVideoUrl: z.string().url().max(500).optional().nullable(),
});

export type UpdateBusinessInfoInput = z.input<typeof updateBusinessInfoSchema>;

// ── Update Content Block Schema ──────────────────────────────────

export const updateContentBlockSchema = z.object({
  blockKey: z.enum(CONTENT_BLOCK_KEYS),
  content: z.string().max(5000),
});

export type UpdateContentBlockInput = z.input<typeof updateContentBlockSchema>;

// ── Response types ───────────────────────────────────────────────

export interface BusinessInfoData {
  organizationName: string | null;
  timezone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  primaryPhone: string | null;
  primaryEmail: string | null;
  logoUrl: string | null;

  accessType: string | null;
  servicesOffered: string[];
  productsOffered: string[];
  rentalsAvailable: string | null;
  foodAndBeverage: string | null;
  promotionsDescription: string | null;
  customerAccessPolicy: string | null;

  websiteUrl: string | null;
  bookingUrl: string | null;
  portalUrl: string | null;
  socialLinks: Record<string, string>;

  secondaryPhone: string | null;
  supportEmail: string | null;
  faxNumber: string | null;

  industryType: string | null;
  businessHours: BusinessHours;
  yearEstablished: number | null;
  taxIdMasked: string | null;

  photoGallery: Array<{ url: string; caption?: string; sortOrder: number }>;
  promoVideoUrl: string | null;
}

export interface ContentBlockData {
  blockKey: ContentBlockKey;
  content: string;
  updatedAt: string | null;
}
