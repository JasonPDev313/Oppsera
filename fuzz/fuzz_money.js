// @ts-check
/**
 * Fuzz target for money utility functions.
 * Tests that dollar↔cent conversions maintain invariants.
 */

function toCents(dollars) {
  return Math.round(dollars * 100);
}

function toDollars(cents) {
  return cents / 100;
}

function addMoney(...amounts) {
  const totalCents = amounts.reduce((sum, amt) => sum + toCents(amt), 0);
  return toDollars(totalCents);
}

function subtractMoney(a, b) {
  return toDollars(toCents(a) - toCents(b));
}

function multiplyMoney(amount, qty) {
  return toDollars(Math.round(toCents(amount) * qty));
}

/**
 * @param {Buffer} data
 */
module.exports.fuzz = function (data) {
  if (data.length < 16) return;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const a = view.getFloat64(0);
  const b = view.getFloat64(8);

  // Skip non-finite values
  if (!Number.isFinite(a) || !Number.isFinite(b)) return;

  // Clamp to reasonable money range
  if (Math.abs(a) > 1e9 || Math.abs(b) > 1e9) return;

  // Invariant: toCents(toDollars(x)) should be close to x for integer x
  const intVal = Math.round(a * 100);
  const roundTrip = toCents(toDollars(intVal));
  if (roundTrip !== intVal) {
    throw new Error(`Round-trip failed: ${intVal} -> ${roundTrip}`);
  }

  // Invariant: addMoney(a, b) === addMoney(b, a) (commutative)
  const sum1 = addMoney(a, b);
  const sum2 = addMoney(b, a);
  if (sum1 !== sum2) {
    throw new Error(`Commutativity failed: addMoney(${a},${b})=${sum1} vs addMoney(${b},${a})=${sum2}`);
  }

  // Invariant: subtractMoney(addMoney(a, b), b) ≈ a (within 1 cent)
  const diff = subtractMoney(addMoney(a, b), b);
  if (Math.abs(toCents(diff) - toCents(a)) > 1) {
    throw new Error(`Inverse failed: subtract(add(${a},${b}),${b})=${diff}, expected ~${a}`);
  }

  // Invariant: multiplyMoney(a, 1) === toDollars(toCents(a))
  const times1 = multiplyMoney(a, 1);
  const normalized = toDollars(toCents(a));
  if (times1 !== normalized) {
    throw new Error(`Multiply-by-1 failed: ${times1} !== ${normalized}`);
  }
};
