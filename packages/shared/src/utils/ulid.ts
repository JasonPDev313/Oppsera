import { monotonicFactory } from 'ulid';

const CROCKFORD_BASE32 = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

const ulid = monotonicFactory();

export function generateUlid(): string {
  return ulid();
}

export function isValidUlid(value: string): boolean {
  if (typeof value !== 'string' || value.length !== 26) {
    return false;
  }
  return CROCKFORD_BASE32.test(value);
}
