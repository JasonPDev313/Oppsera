import { z } from 'zod';

/**
 * Per-location receipt configuration schema.
 * Stored in `tenant_settings` table with moduleKey='receipts', settingKey='config'.
 * Cascading: location-specific → tenant-wide → DEFAULT_RECEIPT_SETTINGS.
 */
export const RECEIPT_FONT_FAMILIES = [
  'courier_new',
  'consolas',
  'lucida_console',
  'arial_narrow',
  'verdana',
  'tahoma',
] as const;

export type ReceiptFontFamily = (typeof RECEIPT_FONT_FAMILIES)[number];

/** CSS font-family stacks for each named receipt font. */
export const RECEIPT_FONT_CSS: Record<ReceiptFontFamily, string> = {
  courier_new: "'Courier New', Courier, monospace",
  consolas: "'Consolas', 'Menlo', monospace",
  lucida_console: "'Lucida Console', Monaco, monospace",
  arial_narrow: "'Arial Narrow', Arial, sans-serif",
  verdana: "'Verdana', Geneva, sans-serif",
  tahoma: "'Tahoma', Geneva, sans-serif",
};

/** Display labels for the settings UI. */
export const RECEIPT_FONT_LABELS: Record<ReceiptFontFamily, string> = {
  courier_new: 'Courier New (classic receipt)',
  consolas: 'Consolas (modern monospace)',
  lucida_console: 'Lucida Console (clean monospace)',
  arial_narrow: 'Arial Narrow (compact, saves paper)',
  verdana: 'Verdana (readable at small sizes)',
  tahoma: 'Tahoma (compact proportional)',
};

export const receiptSettingsSchema = z.object({
  // Printer
  printerWidth: z.enum(['58mm', '80mm']).default('80mm'),

  // Typography
  fontFamily: z.enum(RECEIPT_FONT_FAMILIES).default('courier_new'),
  bodyFontSizePx: z.number().int().min(8).max(16).default(11),
  headerFontSizePx: z.number().int().min(10).max(20).default(14),
  lineHeight: z.number().min(1.0).max(2.0).default(1.4),

  // Header
  showLogo: z.boolean().default(false),
  showAddress: z.boolean().default(true),
  showPhone: z.boolean().default(true),
  showTaxId: z.boolean().default(false),
  customHeaderLines: z.array(z.string().max(100)).max(5).default([]),

  // Items
  showModifiers: z.boolean().default(true),
  showSpecialInstructions: z.boolean().default(true),
  itemGroupBySeat: z.boolean().default(false),

  // Totals
  showTaxBreakdown: z.boolean().default(false),

  // Payment
  showSignatureLine: z.boolean().default(true),
  merchantCopyEnabled: z.boolean().default(true),

  // Footer
  thankYouMessage: z.string().max(200).default('Thank you for your visit!'),
  showReturnPolicy: z.boolean().default(false),
  returnPolicyText: z.string().max(500).default(''),
  customFooterLines: z.array(z.string().max(100)).max(5).default([]),

  // QR Code
  showQrCode: z.boolean().default(true),
  qrCodeLabel: z.string().max(100).default('View your digital receipt'),
  qrCodeUrlTemplate: z.string().max(500).default('/r/{{token}}'),

  // Loyalty
  showLoyalty: z.boolean().default(false),

  // Digital Receipt
  digitalReceiptEnabled: z.boolean().default(true),
  digitalReceiptExpiryDays: z.number().int().min(0).max(365).default(0), // 0 = never expires
  loyaltySignupEnabled: z.boolean().default(true),
  surveyEnabled: z.boolean().default(false), // V1: always false (coming soon)
  emailReceiptFromName: z.string().max(100).default(''),

  // Delivery
  emailReceiptEnabled: z.boolean().default(true),
  giftReceiptEnabled: z.boolean().default(true),
  autoPromptReceipt: z.boolean().default(true),
  receiptCopies: z.number().int().min(1).max(3).default(1),
});

export type ReceiptSettings = z.infer<typeof receiptSettingsSchema>;

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = receiptSettingsSchema.parse({});

export const updateReceiptSettingsSchema = receiptSettingsSchema.partial();

export type UpdateReceiptSettings = z.input<typeof updateReceiptSettingsSchema>;
