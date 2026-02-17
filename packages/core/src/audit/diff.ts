/**
 * Compute the differences between an old and new version of an entity.
 * Only includes fields that actually changed.
 *
 * Usage:
 *   const changes = computeChanges(oldItem, newItem);
 *   // { name: { old: "Widget", new: "Super Widget" }, price: { old: 9.99, new: 12.99 } }
 */
export function computeChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  ignoreFields: string[] = ['updatedAt', 'updatedBy'],
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const key of Object.keys(newObj)) {
    if (ignoreFields.includes(key)) continue;

    const oldVal = oldObj[key];
    const newVal = newObj[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
