export type ItemTypeGroup = 'fnb' | 'retail' | 'service' | 'package';

export const ITEM_TYPE_MAP: Record<ItemTypeGroup, string[]> = {
  fnb: ['food', 'beverage'],
  retail: ['retail', 'green_fee', 'rental'],
  service: ['service'],
  package: ['other'],
};

export function getItemTypeGroup(
  backendType: string,
  metadata?: Record<string, unknown>,
): ItemTypeGroup {
  if (backendType === 'other' && metadata?.isPackage) return 'package';
  if (backendType === 'food' || backendType === 'beverage') return 'fnb';
  if (backendType === 'retail' || backendType === 'green_fee' || backendType === 'rental') return 'retail';
  if (backendType === 'service') return 'service';
  return 'retail';
}
