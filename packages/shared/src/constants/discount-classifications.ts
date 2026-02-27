// ── Discount Classification Taxonomy ─────────────────────────────
// Every discount in the system is tagged with a classification that
// determines which GL account it posts to and how it appears on
// financial statements.
//
// Contra-revenue: reduces reported revenue on P&L (4100–4114)
// Expense: cost the business absorbs (6150–6158)

export type DiscountGlTreatment = 'contra_revenue' | 'expense';

export interface DiscountClassificationDef {
  readonly key: string;
  readonly label: string;
  readonly glTreatment: DiscountGlTreatment;
  readonly defaultAccountCode: string;
  readonly description: string;
}

export const DISCOUNT_CLASSIFICATIONS: readonly DiscountClassificationDef[] = [
  // ── Contra-Revenue (discounts that reduce reported revenue) ──
  { key: 'manual_discount',     label: 'Manual Discount',            glTreatment: 'contra_revenue', defaultAccountCode: '4100', description: 'Cashier-applied percentage or dollar off' },
  { key: 'promo_code',          label: 'Promo Code',                 glTreatment: 'contra_revenue', defaultAccountCode: '4101', description: 'Promo code or coupon redemptions' },
  { key: 'employee_discount',   label: 'Employee Discount',          glTreatment: 'contra_revenue', defaultAccountCode: '4102', description: 'Staff meal or merchandise discounts' },
  { key: 'loyalty_discount',    label: 'Loyalty Discount',           glTreatment: 'contra_revenue', defaultAccountCode: '4103', description: 'Points redemption or member pricing' },
  { key: 'member_discount',     label: 'Member Discount',            glTreatment: 'contra_revenue', defaultAccountCode: '4104', description: 'Membership-based pricing (golf/club member rates)' },
  { key: 'price_match',         label: 'Price Match',                glTreatment: 'contra_revenue', defaultAccountCode: '4105', description: 'Competitor price matching' },
  { key: 'volume_discount',     label: 'Volume / Quantity Discount', glTreatment: 'contra_revenue', defaultAccountCode: '4106', description: 'Quantity-based tiered pricing (buy X get Y)' },
  { key: 'senior_military',     label: 'Senior / Military Discount', glTreatment: 'contra_revenue', defaultAccountCode: '4107', description: 'Senior citizen, veteran, or active military discounts' },
  { key: 'group_event',         label: 'Group / Event Discount',     glTreatment: 'contra_revenue', defaultAccountCode: '4108', description: 'Group rate or event-based pricing (tournaments, banquets)' },
  { key: 'seasonal_clearance',  label: 'Seasonal / Clearance',       glTreatment: 'contra_revenue', defaultAccountCode: '4109', description: 'End-of-season markdowns and clearance pricing' },
  { key: 'vendor_funded',       label: 'Vendor-Funded Promotion',    glTreatment: 'contra_revenue', defaultAccountCode: '4110', description: 'Vendor-funded co-op discounts or trade promotions' },
  { key: 'rain_check',          label: 'Rain Check Credit',          glTreatment: 'contra_revenue', defaultAccountCode: '4111', description: 'Rain check voucher redemptions (golf/outdoor)' },
  { key: 'early_payment',       label: 'Cash / Early Payment',       glTreatment: 'contra_revenue', defaultAccountCode: '4112', description: 'Cash payment or early settlement discounts' },
  { key: 'bundle_package',      label: 'Bundle / Package Discount',  glTreatment: 'contra_revenue', defaultAccountCode: '4113', description: 'Multi-item bundle or package pricing reductions' },
  { key: 'trade_discount',      label: 'Trade Discount',             glTreatment: 'contra_revenue', defaultAccountCode: '4114', description: 'B2B wholesale or trade pricing adjustments' },

  // ── Expense (comps — costs the business absorbs) ─────────────
  { key: 'manager_comp',        label: 'Manager Comp',               glTreatment: 'expense',        defaultAccountCode: '6150', description: 'Manager-authorized giveaways' },
  { key: 'promo_comp',          label: 'Promotional Comp',           glTreatment: 'expense',        defaultAccountCode: '6151', description: 'Marketing or promotion giveaways' },
  { key: 'quality_recovery',    label: 'Quality Recovery',           glTreatment: 'expense',        defaultAccountCode: '6152', description: 'Food or service quality issue comps' },
  { key: 'price_override',      label: 'Price Override Loss',        glTreatment: 'expense',        defaultAccountCode: '6153', description: 'Revenue loss from manual price reductions' },
  { key: 'other_comp',          label: 'Other Comp / Write-off',     glTreatment: 'expense',        defaultAccountCode: '6154', description: 'Catch-all comp expense' },
  { key: 'spoilage_waste',      label: 'Spoilage & Waste',           glTreatment: 'expense',        defaultAccountCode: '6155', description: 'Food spoilage, breakage, or waste write-offs' },
  { key: 'charity_donation',    label: 'Charity / Donation Comp',    glTreatment: 'expense',        defaultAccountCode: '6156', description: 'Charitable donations and community sponsorship comps' },
  { key: 'training_staff_meal', label: 'Training & Staff Meals',     glTreatment: 'expense',        defaultAccountCode: '6157', description: 'Training comp meals and authorized staff meals' },
  { key: 'insurance_recovery',  label: 'Insurance Recovery',         glTreatment: 'expense',        defaultAccountCode: '6158', description: 'Insurance claim write-offs and recovery adjustments' },
] as const;

/** Union type of all discount classification keys */
export type DiscountClassification = (typeof DISCOUNT_CLASSIFICATIONS)[number]['key'];

/** All valid classification keys as a string array (for Zod enum validation) */
export const DISCOUNT_CLASSIFICATION_KEYS = DISCOUNT_CLASSIFICATIONS.map(d => d.key) as readonly string[];

/** Check if a classification is contra-revenue (debit reduces revenue) */
export function isContraRevenue(classification: string): boolean {
  return getDiscountGlTreatment(classification) === 'contra_revenue';
}

/** Check if a classification is expense (debit increases expense) */
export function isExpenseClassification(classification: string): boolean {
  return getDiscountGlTreatment(classification) === 'expense';
}

/** Look up the GL treatment for a classification */
export function getDiscountGlTreatment(classification: string): DiscountGlTreatment {
  const def = DISCOUNT_CLASSIFICATIONS.find(d => d.key === classification);
  // Default to contra_revenue for unknown classifications (safe fallback)
  return def?.glTreatment ?? 'contra_revenue';
}

/** Look up the full definition for a classification */
export function getDiscountClassificationDef(classification: string): DiscountClassificationDef | undefined {
  return DISCOUNT_CLASSIFICATIONS.find(d => d.key === classification);
}

/** Get the default GL account code for a classification */
export function getDefaultAccountCode(classification: string): string {
  return getDiscountClassificationDef(classification)?.defaultAccountCode ?? '4100';
}

/** Group classifications by GL treatment for UI display */
export const CONTRA_REVENUE_CLASSIFICATIONS = DISCOUNT_CLASSIFICATIONS.filter(d => d.glTreatment === 'contra_revenue');
export const EXPENSE_CLASSIFICATIONS = DISCOUNT_CLASSIFICATIONS.filter(d => d.glTreatment === 'expense');
