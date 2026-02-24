import type { SurchargeConfig } from './resolve-surcharge';

/**
 * Calculate surcharge amount in cents.
 *
 * Returns 0 when:
 * - Surcharging is disabled
 * - Card is not credit (when applyToCreditOnly = true)
 * - Card is debit (when exemptDebit = true)
 * - Card is prepaid (when exemptPrepaid = true)
 * - Customer is in a prohibited state
 *
 * Otherwise: Math.round(amountCents * min(surchargeRate, maxRate))
 */
export function calculateSurcharge(
  config: SurchargeConfig,
  amountCents: number,
  binType?: string | null,
  customerState?: string | null,
): number {
  if (!config.isEnabled) return 0;
  if (amountCents <= 0) return 0;

  // Credit-only check
  if (config.applyToCreditOnly && binType && binType !== 'credit') return 0;

  // Debit exemption
  if (config.exemptDebit && binType === 'debit') return 0;

  // Prepaid exemption
  if (config.exemptPrepaid && binType === 'prepaid') return 0;

  // State prohibition check
  if (
    customerState &&
    config.prohibitedStates.length > 0 &&
    config.prohibitedStates.includes(customerState.toUpperCase())
  ) {
    return 0;
  }

  // Calculate: use the lesser of surchargeRate and maxRate
  const effectiveRate = Math.min(config.surchargeRate, config.maxRate);
  if (effectiveRate <= 0) return 0;

  return Math.round(amountCents * effectiveRate);
}

/**
 * Format the customer disclosure text by replacing {rate} placeholder.
 */
export function formatDisclosure(
  template: string | null,
  rate: number,
  amountCents?: number,
): string {
  if (!template) return '';
  let text = template.replace('{rate}', (rate * 100).toFixed(2));
  if (amountCents !== undefined) {
    text = text.replace('{amount}', (amountCents / 100).toFixed(2));
  }
  return text;
}
