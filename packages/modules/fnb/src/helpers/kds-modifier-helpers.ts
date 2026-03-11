/**
 * Shared helpers for extracting and formatting modifier data from JSONB.
 * Used by both send-order-lines-to-kds and handle-order-placed-for-kds.
 */

/** Extract modifier IDs from the JSONB modifiers array. */
export function extractModifierIds(modifiers: unknown): string[] {
  if (!Array.isArray(modifiers)) return [];
  const ids: string[] = [];
  for (const mod of modifiers) {
    if (typeof mod === 'object' && mod !== null) {
      const m = mod as Record<string, unknown>;
      const id = m.modifierId as string | undefined;
      if (id) ids.push(id);
    }
  }
  return ids;
}

/** Formats the JSONB modifiers array into a human-readable summary string. */
export function formatModifierSummary(modifiers: unknown): string | null {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return null;

  const parts: string[] = [];
  for (const mod of modifiers) {
    if (typeof mod === 'object' && mod !== null) {
      const m = mod as Record<string, unknown>;
      const name = String(m.name ?? m.modifierName ?? m.label ?? '');
      if (name) parts.push(name);
    } else if (typeof mod === 'string') {
      parts.push(mod);
    }
  }
  return parts.length > 0 ? parts.join(', ') : null;
}
