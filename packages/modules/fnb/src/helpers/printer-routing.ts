/**
 * Printer routing logic for F&B print jobs.
 * Pure function — takes routing rules and context, returns the best printer ID.
 */

export interface RoutingRule {
  id: string;
  stationId: string | null;
  printerId: string;
  printJobType: string;
  priority: number;
  isActive: boolean;
}

export interface PrintRoutingContext {
  printJobType: string;
  locationId: string;
  stationId?: string;
  terminalReceiptPrinterId?: string;
}

/**
 * Resolves the best printer ID for a print job.
 *
 * Routing priority:
 * 1. Station-specific rule with matching job type (highest priority wins)
 * 2. Location-level rule with matching job type (highest priority wins)
 * 3. Terminal receipt printer (for guest_check/receipt/cash_drop_receipt/close_batch_report)
 * 4. null (no printer found)
 */
export function resolveRoutedPrinter(
  rules: RoutingRule[],
  context: PrintRoutingContext,
): string | null {
  const activeRules = rules
    .filter((r) => r.isActive && r.printJobType === context.printJobType)
    .sort((a, b) => b.priority - a.priority); // higher priority first

  // 1. Station-specific match
  if (context.stationId) {
    const stationRule = activeRules.find((r) => r.stationId === context.stationId);
    if (stationRule) return stationRule.printerId;
  }

  // 2. Location-level match (no stationId on the rule)
  const locationRule = activeRules.find((r) => r.stationId == null);
  if (locationRule) return locationRule.printerId;

  // 3. Terminal receipt printer fallback (for receipt-type jobs)
  const receiptTypes = ['guest_check', 'receipt', 'cash_drop_receipt', 'close_batch_report'];
  if (receiptTypes.includes(context.printJobType) && context.terminalReceiptPrinterId) {
    return context.terminalReceiptPrinterId;
  }

  return null;
}

/** Check whether a job type is a receipt type (printed at the terminal) */
export function isReceiptType(jobType: string): boolean {
  return ['guest_check', 'receipt', 'cash_drop_receipt', 'close_batch_report'].includes(jobType);
}

/** Check whether a job type is a kitchen/station type (printed at the station) */
export function isStationType(jobType: string): boolean {
  return ['kitchen_chit', 'bar_chit', 'delta_chit', 'expo_chit'].includes(jobType);
}
