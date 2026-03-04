import { z } from 'zod';

// ── Custom Field Definition ─────────────────────────────────────────
const customFieldSchema = z.object({
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'number', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
});

// ── Form Config ─────────────────────────────────────────────────────
export const waitlistFormConfigSchema = z.object({
  minPartySize: z.number().min(1).max(99).default(1),
  maxPartySize: z.number().min(1).max(99).default(20),
  requirePhone: z.boolean().default(true),
  enableSeatingPreference: z.boolean().default(true),
  seatingOptions: z.array(z.string()).default(['Indoor', 'Outdoor', 'Bar', 'Patio']),
  enableOccasion: z.boolean().default(false),
  occasionOptions: z.array(z.string()).default(['Birthday', 'Anniversary', 'Business', 'Date Night']),
  enableNotes: z.boolean().default(true),
  notesMaxLength: z.number().min(50).max(2000).default(500),
  customFields: z.array(customFieldSchema).default([]),
  termsText: z.string().max(2000).nullable().default(null),
}).default({});

// ── Notification Config ─────────────────────────────────────────────
export const waitlistNotificationConfigSchema = z.object({
  confirmationTemplate: z.string().max(500).default(
    'Hi {guest_name}! You\'re #{position} on the waitlist at {venue_name}. Estimated wait: ~{estimated_wait} min. Track: {track_link}',
  ),
  readyTemplate: z.string().max(500).default(
    'Hi {guest_name}! Your table at {venue_name} is ready! Please head to the host stand within {grace_period} minutes.',
  ),
  cancellationTemplate: z.string().max(500).default(
    'Hi {guest_name}, your waitlist spot at {venue_name} has been cancelled.',
  ),
  reminderEnabled: z.boolean().default(false),
  reminderTemplate: z.string().max(500).nullable().default(null),
  reminderAfterMinutes: z.number().min(5).max(120).default(30),
  graceMinutes: z.number().min(3).max(60).default(10),
  autoRemoveAfterGrace: z.boolean().default(true),
  enableTwoWaySms: z.boolean().default(false),
}).default({});

// ── Queue Config ────────────────────────────────────────────────────
export const waitlistQueueConfigSchema = z.object({
  maxCapacity: z.number().min(1).max(500).default(50),
  estimationMethod: z.enum(['auto', 'manual']).default('auto'),
  autoPromotionEnabled: z.boolean().default(true),
  promotionLogic: z.enum(['first_in_line', 'best_fit', 'priority_first']).default('first_in_line'),
  priorityLevels: z.array(z.string()).default(['Normal', 'VIP']),
  pacingEnabled: z.boolean().default(false),
  pacingMaxPerInterval: z.number().min(1).max(100).default(10),
  pacingIntervalMinutes: z.number().min(5).max(120).default(30),
  allowCheckWaitBeforeJoining: z.boolean().default(true),
}).default({});

// ── Branding ────────────────────────────────────────────────────────
export const waitlistBrandingSchema = z.object({
  logoUrl: z.string().url().nullable().default(null),
  primaryColor: z.string().max(20).default('#6366f1'),
  secondaryColor: z.string().max(20).default('#3b82f6'),
  accentColor: z.string().max(20).default('#22c55e'),
  backgroundColor: z.string().max(20).nullable().default(null),
  backgroundImageUrl: z.string().url().nullable().default(null),
  fontFamily: z.enum(['Inter', 'Plus Jakarta Sans', 'DM Sans', 'Poppins', 'system-ui']).default('Inter'),
  welcomeHeadline: z.string().max(200).default('Join Our Waitlist'),
  welcomeSubtitle: z.string().max(500).default("We'll text you when your table is ready"),
  footerText: z.string().max(500).nullable().default(null),
  customCss: z.string().max(5000).nullable().default(null),
}).default({});

// ── Content Config ──────────────────────────────────────────────────
export const waitlistContentConfigSchema = z.object({
  whileYouWaitEnabled: z.boolean().default(false),
  whileYouWaitType: z.enum(['text', 'menu_link', 'specials']).default('text'),
  whileYouWaitContent: z.string().max(2000).nullable().default(null),
  whileYouWaitUrl: z.string().url().nullable().default(null),
}).default({});

// ── Operating Hours ─────────────────────────────────────────────────
const dayHoursSchema = z.object({
  open: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  close: z.string().regex(/^\d{2}:\d{2}$/).default('23:59'),
});

export const waitlistOperatingHoursSchema = z.object({
  useBusinessHours: z.boolean().default(true),
  customHours: z.record(z.string(), dayHoursSchema).nullable().default(null),
}).default({});

// ── Combined Config Schema ──────────────────────────────────────────
export const waitlistConfigSchema = z.object({
  formConfig: waitlistFormConfigSchema,
  notificationConfig: waitlistNotificationConfigSchema,
  queueConfig: waitlistQueueConfigSchema,
  branding: waitlistBrandingSchema,
  contentConfig: waitlistContentConfigSchema,
  operatingHours: waitlistOperatingHoursSchema,
});

export type WaitlistFormConfig = z.infer<typeof waitlistFormConfigSchema>;
export type WaitlistNotificationConfig = z.infer<typeof waitlistNotificationConfigSchema>;
export type WaitlistQueueConfig = z.infer<typeof waitlistQueueConfigSchema>;
export type WaitlistBranding = z.infer<typeof waitlistBrandingSchema>;
export type WaitlistContentConfig = z.infer<typeof waitlistContentConfigSchema>;
export type WaitlistOperatingHours = z.infer<typeof waitlistOperatingHoursSchema>;
export type WaitlistConfig = z.infer<typeof waitlistConfigSchema>;
export type WaitlistConfigInput = z.input<typeof waitlistConfigSchema>;

export interface WaitlistConfigRow {
  id: string;
  tenantId: string;
  locationId: string | null;
  enabled: boolean;
  slugOverride: string | null;
  formConfig: WaitlistFormConfig;
  notificationConfig: WaitlistNotificationConfig;
  queueConfig: WaitlistQueueConfig;
  branding: WaitlistBranding;
  contentConfig: WaitlistContentConfig;
  operatingHours: WaitlistOperatingHours;
  createdAt: string;
  updatedAt: string;
}

/** Parse defaults — calling with {} gives a fully-populated config */
export function getDefaultWaitlistConfig(): WaitlistConfig {
  return waitlistConfigSchema.parse({});
}

/** Deep-merge partial updates into existing config (2 levels deep) */
export function mergeWaitlistConfig(
  existing: WaitlistConfig,
  updates: Partial<WaitlistConfigInput>,
): WaitlistConfig {
  const merged: Record<string, unknown> = { ...existing };
  for (const [sectionKey, sectionValue] of Object.entries(updates)) {
    if (sectionValue === undefined || sectionValue === null || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) continue;
    const existingSection = (existing as Record<string, unknown>)[sectionKey];
    if (!existingSection || typeof existingSection !== 'object' || Array.isArray(existingSection)) {
      merged[sectionKey] = sectionValue;
      continue;
    }
    const mergedSection: Record<string, unknown> = { ...(existingSection as Record<string, unknown>) };
    for (const [fieldKey, fieldValue] of Object.entries(sectionValue as Record<string, unknown>)) {
      mergedSection[fieldKey] = fieldValue;
    }
    merged[sectionKey] = mergedSection;
  }
  return waitlistConfigSchema.parse(merged);
}

/** Map raw DB row → typed WaitlistConfigRow */
export function mapWaitlistConfigRow(row: Record<string, unknown>): WaitlistConfigRow {
  // Each sub-schema has .default({}) so parse({}) always returns a fully-populated value.
  // We parse through the combined schema then extract sections for correct types.
  const parsed = waitlistConfigSchema.parse({
    formConfig: row.form_config ?? {},
    notificationConfig: row.notification_config ?? {},
    queueConfig: row.queue_config ?? {},
    branding: row.branding ?? {},
    contentConfig: row.content_config ?? {},
    operatingHours: row.operating_hours ?? {},
  });

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: row.location_id ? String(row.location_id) : null,
    enabled: Boolean(row.enabled),
    slugOverride: row.slug_override ? String(row.slug_override) : null,
    formConfig: parsed.formConfig,
    notificationConfig: parsed.notificationConfig,
    queueConfig: parsed.queueConfig,
    branding: parsed.branding,
    contentConfig: parsed.contentConfig,
    operatingHours: parsed.operatingHours,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
