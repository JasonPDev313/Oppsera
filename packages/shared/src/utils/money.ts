function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * Add two or more dollar amounts together, rounding via integer cent arithmetic
 * to avoid floating-point drift.
 *
 * NOTE: Inputs and output are in **dollars** (e.g., 9.99), NOT cents.
 * Use this only in the catalog/GL/AP/AR layer. For order totals (cents),
 * perform integer addition directly.
 */
function addMoney(...amounts: number[]): number {
  const totalCents = amounts.reduce((sum, amt) => sum + toCents(amt), 0);
  return toDollars(totalCents);
}

function subtractMoney(a: number, b: number): number {
  return toDollars(toCents(a) - toCents(b));
}

function multiplyMoney(amount: number, qty: number): number {
  return toDollars(Math.round(toCents(amount) * qty));
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export { toCents, toDollars, addMoney, subtractMoney, multiplyMoney, formatMoney };
