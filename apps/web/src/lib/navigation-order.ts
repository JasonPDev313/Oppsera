import type { NavItem } from './navigation';
import { navigation as defaultNavigation } from './navigation';
import type { NavItemPreference } from '@oppsera/shared';

/** Hrefs that cannot be hidden — always remain visible in the sidebar. */
const PINNED_HREFS = new Set(['/dashboard', '/settings']);

/**
 * Apply tenant nav preferences to the default navigation array.
 *
 * Phase 1: items in saved order (respecting visibility + entitlement).
 * Phase 2: new items not yet in saved order appended at the end.
 *
 * Returns a new array — never mutates the input.
 */
export function applyNavPreferences(
  savedOrder: NavItemPreference[],
  isModuleEnabled: (key: string) => boolean,
): NavItem[] {
  if (savedOrder.length === 0) {
    return defaultNavigation.filter(
      (item) => !item.moduleKey || isModuleEnabled(item.moduleKey),
    );
  }

  const navByHref = new Map<string, NavItem>();
  for (const item of defaultNavigation) {
    navByHref.set(item.href, item);
  }

  const result: NavItem[] = [];
  const seen = new Set<string>();

  // Phase 1: items in saved order
  for (const pref of savedOrder) {
    const item = navByHref.get(pref.href);
    if (!item) {
      // Stale entry — item removed from codebase
      seen.add(pref.href);
      continue;
    }
    if (pref.hidden && !PINNED_HREFS.has(pref.href)) {
      // Hidden by user (but pinned items ignore hidden flag)
      seen.add(pref.href);
      continue;
    }
    if (item.moduleKey && !isModuleEnabled(item.moduleKey)) {
      // Entitlement disabled
      seen.add(pref.href);
      continue;
    }
    result.push(item);
    seen.add(pref.href);
  }

  // Phase 2: new items not in saved order
  for (const item of defaultNavigation) {
    if (seen.has(item.href)) continue;
    if (item.moduleKey && !isModuleEnabled(item.moduleKey)) continue;
    result.push(item);
  }

  return result;
}

/**
 * Check whether a nav item href is pinned (cannot be hidden).
 */
export function isPinnedNavItem(href: string): boolean {
  return PINNED_HREFS.has(href);
}
