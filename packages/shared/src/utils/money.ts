function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function toDollars(cents: number): number {
  return cents / 100;
}

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
