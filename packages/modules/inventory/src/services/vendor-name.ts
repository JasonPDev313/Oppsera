/**
 * Pure functions for vendor name normalization and duplicate detection (Rule VM-2).
 */

/** Normalize a vendor name: trim whitespace and lowercase for unique comparison. */
export function normalizeVendorName(name: string): string {
  return name.trim().toLowerCase();
}
