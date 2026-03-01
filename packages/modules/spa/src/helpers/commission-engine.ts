// ══════════════════════════════════════════════════════════════════
// Spa Provider Commission Engine — Pure Business Logic
// ══════════════════════════════════════════════════════════════════
//
// Pure functions for calculating spa provider commissions with a
// 6-level priority resolution system. No database access — all
// inputs are passed in as arguments.
//
// Money convention: all amounts are INTEGER CENTS (never floating point).
// Dollar-based config values (flatAmount) are converted to cents at
// the calculation boundary via Math.round(dollars * 100).
//
// Resolution priority (most specific wins):
//   1. Provider + specific Service
//   2. Provider + Service Category
//   3. Provider + all services (appliesTo = 'all')
//   4. Tenant + specific Service (providerId is null)
//   5. Tenant + Service Category (providerId is null)
//   6. Tenant + all (providerId is null, appliesTo = 'all')
// ══════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────

export type CommissionType = 'percentage' | 'flat' | 'tiered' | 'sliding_scale';
export type CommissionAppliesTo = 'service' | 'retail' | 'addon' | 'tip' | 'all';

export interface CommissionRule {
  id: string;
  name: string;
  providerId: string | null; // null = tenant-level default
  serviceId: string | null;
  serviceCategory: string | null;
  commissionType: CommissionType;
  rate: number | null; // percentage rate (e.g., 40 for 40%)
  flatAmount: number | null; // dollar amount
  tiers: Array<{ threshold: number; rate: number }> | null; // threshold in cents, rate in percentage
  appliesTo: CommissionAppliesTo;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveUntil: string | null;
  isActive: boolean;
  priority: number; // higher = higher priority within same specificity level
}

export interface CommissionInput {
  providerId: string;
  serviceId: string;
  serviceCategory: string;
  appliesTo: CommissionAppliesTo;
  baseAmountCents: number; // service price, tip amount, addon price, etc.
  appointmentDate: string; // YYYY-MM-DD — to check rule effectiveFrom/Until
}

export interface CommissionResult {
  ruleId: string;
  ruleName: string;
  commissionType: CommissionType;
  baseAmountCents: number;
  commissionAmountCents: number;
  rateApplied: number; // effective percentage applied
  resolutionLevel: number; // 1-6, which priority level matched
  resolutionDescription: string;
}

export interface CommissionSummary {
  providerId: string;
  totalBaseAmountCents: number;
  totalCommissionCents: number;
  effectiveRate: number; // totalCommission / totalBase * 100
  lineItems: CommissionResult[];
}

// ── Resolution Level Descriptions ────────────────────────────────

const RESOLUTION_DESCRIPTIONS: Record<number, string> = {
  1: 'Provider + specific service override',
  2: 'Provider + service category default',
  3: 'Provider catch-all (all services)',
  4: 'Tenant + specific service default',
  5: 'Tenant + service category default',
  6: 'Tenant catch-all (all services)',
};

// ── Main Functions ──────────────────────────────────────────────

/**
 * Returns a human-readable description of which resolution level matched.
 */
export function getResolutionDescription(level: number): string {
  return RESOLUTION_DESCRIPTIONS[level] ?? `Unknown resolution level (${level})`;
}

/**
 * Check whether a commission rule is effective on a given date.
 *
 * A rule is effective when:
 *   - isActive is true
 *   - date >= effectiveFrom
 *   - effectiveUntil is null (open-ended) OR date <= effectiveUntil
 */
export function isRuleEffective(rule: CommissionRule, date: string): boolean {
  if (!rule.isActive) return false;
  if (date < rule.effectiveFrom) return false;
  if (rule.effectiveUntil != null && date > rule.effectiveUntil) return false;
  return true;
}

/**
 * Resolve the most specific commission rule for a given input.
 *
 * Applies the 6-level priority resolution:
 *   1. Provider + specific Service → most specific
 *   2. Provider + Service Category → provider-level category default
 *   3. Provider + all services (appliesTo = 'all') → provider catch-all
 *   4. Tenant + specific Service (providerId is null) → tenant service default
 *   5. Tenant + Service Category (providerId is null) → tenant category default
 *   6. Tenant + all (providerId is null, appliesTo = 'all') → tenant catch-all
 *
 * Within each level, the rule with the highest `priority` value wins.
 * Returns null if no matching rule is found.
 */
export function resolveCommissionRule(
  rules: CommissionRule[],
  input: CommissionInput,
): CommissionRule | null {
  // Pre-filter: only active rules effective on the appointment date
  // that match the appliesTo type (or are 'all')
  const eligible = rules.filter(
    (r) =>
      isRuleEffective(r, input.appointmentDate) &&
      (r.appliesTo === input.appliesTo || r.appliesTo === 'all'),
  );

  // Level 1: Provider + specific Service
  const level1 = pickHighestPriority(
    eligible.filter(
      (r) =>
        r.providerId === input.providerId &&
        r.serviceId === input.serviceId,
    ),
  );
  if (level1) return level1;

  // Level 2: Provider + Service Category (serviceId is null)
  const level2 = pickHighestPriority(
    eligible.filter(
      (r) =>
        r.providerId === input.providerId &&
        r.serviceId == null &&
        r.serviceCategory === input.serviceCategory,
    ),
  );
  if (level2) return level2;

  // Level 3: Provider + all (serviceId and serviceCategory are null, appliesTo = 'all')
  const level3 = pickHighestPriority(
    eligible.filter(
      (r) =>
        r.providerId === input.providerId &&
        r.serviceId == null &&
        r.serviceCategory == null &&
        r.appliesTo === 'all',
    ),
  );
  if (level3) return level3;

  // Level 4: Tenant + specific Service (providerId is null)
  const level4 = pickHighestPriority(
    eligible.filter(
      (r) =>
        r.providerId == null &&
        r.serviceId === input.serviceId,
    ),
  );
  if (level4) return level4;

  // Level 5: Tenant + Service Category (providerId is null)
  const level5 = pickHighestPriority(
    eligible.filter(
      (r) =>
        r.providerId == null &&
        r.serviceId == null &&
        r.serviceCategory === input.serviceCategory,
    ),
  );
  if (level5) return level5;

  // Level 6: Tenant + all (providerId is null, appliesTo = 'all')
  const level6 = pickHighestPriority(
    eligible.filter(
      (r) =>
        r.providerId == null &&
        r.serviceId == null &&
        r.serviceCategory == null &&
        r.appliesTo === 'all',
    ),
  );
  if (level6) return level6;

  return null;
}

/**
 * Determine which resolution level a rule matched at.
 * Returns the level (1-6) or 0 if it cannot be determined.
 */
export function getResolutionLevel(rule: CommissionRule, input: CommissionInput): number {
  if (rule.providerId === input.providerId && rule.serviceId === input.serviceId) return 1;
  if (rule.providerId === input.providerId && rule.serviceId == null && rule.serviceCategory === input.serviceCategory) return 2;
  if (rule.providerId === input.providerId && rule.serviceId == null && rule.serviceCategory == null && rule.appliesTo === 'all') return 3;
  if (rule.providerId == null && rule.serviceId === input.serviceId) return 4;
  if (rule.providerId == null && rule.serviceId == null && rule.serviceCategory === input.serviceCategory) return 5;
  if (rule.providerId == null && rule.serviceId == null && rule.serviceCategory == null && rule.appliesTo === 'all') return 6;
  return 0;
}

/**
 * Calculate the commission amount and effective rate for a given rule.
 *
 * Commission types:
 *   - 'percentage': baseAmountCents * (rate / 100), rounded to nearest cent
 *   - 'flat': flatAmount converted from dollars to cents
 *   - 'tiered': find the tier where baseAmountCents <= threshold, use that rate.
 *     Tiers are sorted ascending by threshold. If above all tiers, use last tier.
 *   - 'sliding_scale': same tier lookup as tiered, rate increases with volume.
 *     Calculate: baseAmountCents * (effectiveRate / 100), rounded to nearest cent.
 *
 * Returns { amountCents, rateApplied } where rateApplied is the effective
 * percentage (even for flat amounts, expressed as percentage of base).
 */
export function calculateCommission(
  rule: CommissionRule,
  baseAmountCents: number,
): { amountCents: number; rateApplied: number } {
  if (baseAmountCents <= 0) {
    return { amountCents: 0, rateApplied: 0 };
  }

  switch (rule.commissionType) {
    case 'percentage': {
      const rate = rule.rate ?? 0;
      const amountCents = Math.round(baseAmountCents * rate / 100);
      return { amountCents, rateApplied: rate };
    }

    case 'flat': {
      const amountCents = Math.round((rule.flatAmount ?? 0) * 100);
      // Express flat amount as effective percentage of base for reporting
      const rateApplied = baseAmountCents > 0
        ? Math.round((amountCents / baseAmountCents) * 10000) / 100
        : 0;
      return { amountCents, rateApplied };
    }

    case 'tiered': {
      const effectiveRate = resolveTierRate(rule.tiers, baseAmountCents);
      const amountCents = Math.round(baseAmountCents * effectiveRate / 100);
      return { amountCents, rateApplied: effectiveRate };
    }

    case 'sliding_scale': {
      const effectiveRate = resolveTierRate(rule.tiers, baseAmountCents);
      const amountCents = Math.round(baseAmountCents * effectiveRate / 100);
      return { amountCents, rateApplied: effectiveRate };
    }

    default:
      return { amountCents: 0, rateApplied: 0 };
  }
}

/**
 * Compute commissions for all items in an appointment.
 *
 * For each item, resolves and calculates commissions for:
 *   - Service price (appliesTo = 'service')
 *   - Addon price if > 0 (appliesTo = 'addon')
 *   - Tip if > 0 (appliesTo = 'tip')
 *
 * Items without a matching rule are silently skipped (no commission).
 */
export function computeAppointmentCommissions(
  rules: CommissionRule[],
  items: Array<{
    serviceId: string;
    serviceCategory: string;
    priceCents: number;
    addonPriceCents?: number;
    tipCents?: number;
  }>,
  providerId: string,
  appointmentDate: string,
): CommissionSummary {
  const lineItems: CommissionResult[] = [];

  for (const item of items) {
    // Service commission
    if (item.priceCents > 0) {
      const result = resolveAndCalculate(rules, {
        providerId,
        serviceId: item.serviceId,
        serviceCategory: item.serviceCategory,
        appliesTo: 'service',
        baseAmountCents: item.priceCents,
        appointmentDate,
      });
      if (result) lineItems.push(result);
    }

    // Addon commission
    const addonCents = item.addonPriceCents ?? 0;
    if (addonCents > 0) {
      const result = resolveAndCalculate(rules, {
        providerId,
        serviceId: item.serviceId,
        serviceCategory: item.serviceCategory,
        appliesTo: 'addon',
        baseAmountCents: addonCents,
        appointmentDate,
      });
      if (result) lineItems.push(result);
    }

    // Tip commission
    const tipCents = item.tipCents ?? 0;
    if (tipCents > 0) {
      const result = resolveAndCalculate(rules, {
        providerId,
        serviceId: item.serviceId,
        serviceCategory: item.serviceCategory,
        appliesTo: 'tip',
        baseAmountCents: tipCents,
        appointmentDate,
      });
      if (result) lineItems.push(result);
    }
  }

  const totalBaseAmountCents = lineItems.reduce((sum, li) => sum + li.baseAmountCents, 0);
  const totalCommissionCents = lineItems.reduce((sum, li) => sum + li.commissionAmountCents, 0);
  const effectiveRate = totalBaseAmountCents > 0
    ? Math.round((totalCommissionCents / totalBaseAmountCents) * 10000) / 100
    : 0;

  return {
    providerId,
    totalBaseAmountCents,
    totalCommissionCents,
    effectiveRate,
    lineItems,
  };
}

// ── Internal Helpers ────────────────────────────────────────────

/**
 * Pick the rule with the highest priority from a list.
 * Returns null if the list is empty.
 */
function pickHighestPriority(candidates: CommissionRule[]): CommissionRule | null {
  if (candidates.length === 0) return null;

  let best = candidates[0]!;
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    if (candidate.priority > best.priority) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Resolve the effective rate from a tiers array based on the base amount.
 *
 * Tiers are sorted ascending by threshold. Walk through tiers to find
 * the first one where baseAmountCents <= threshold. If above all tiers,
 * use the last tier's rate.
 *
 * Returns 0 if tiers is null or empty.
 */
function resolveTierRate(
  tiers: Array<{ threshold: number; rate: number }> | null,
  baseAmountCents: number,
): number {
  if (!tiers || tiers.length === 0) return 0;

  // Sort ascending by threshold (defensive — caller may not guarantee order)
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);

  for (const tier of sorted) {
    if (baseAmountCents <= tier.threshold) {
      return tier.rate;
    }
  }

  // Above all tiers — use last (highest) tier's rate
  return sorted[sorted.length - 1]!.rate;
}

/**
 * Resolve a rule and calculate commission for a single input.
 * Returns null if no matching rule is found.
 */
function resolveAndCalculate(
  rules: CommissionRule[],
  input: CommissionInput,
): CommissionResult | null {
  const rule = resolveCommissionRule(rules, input);
  if (!rule) return null;

  const { amountCents, rateApplied } = calculateCommission(rule, input.baseAmountCents);
  const resolutionLevel = getResolutionLevel(rule, input);

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    commissionType: rule.commissionType,
    baseAmountCents: input.baseAmountCents,
    commissionAmountCents: amountCents,
    rateApplied,
    resolutionLevel,
    resolutionDescription: getResolutionDescription(resolutionLevel),
  };
}
