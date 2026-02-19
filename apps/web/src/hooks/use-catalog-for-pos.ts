'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { getItemTypeGroup } from '@oppsera/shared';
import type { CategoryRow } from '@/types/catalog';
import type { CatalogItemForPOS, CatalogNavState, CatalogNavLevel } from '@/types/pos';

// ── Constants ──────────────────────────────────────────────────────

const FAVORITES_KEY_PREFIX = 'pos_favorites_';
const CACHE_KEY_PREFIX = 'pos_catalog_';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — keep POS catalog fresh during long shifts
const MAX_RECENT_ITEMS = 20;

// ── POS API response types ─────────────────────────────────────────

interface POSRawItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  itemType: string;
  defaultPrice: string;
  priceIncludesTax: boolean;
  isTrackable: boolean;
  metadata: Record<string, unknown> | null;
  categoryId: string | null;
}

interface POSRawCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

interface CachedCatalog {
  items: POSRawItem[];
  categories: POSRawCategory[];
  cachedAt: number;
}

// ── Helpers ────────────────────────────────────────────────────────

function loadFavorites(locationId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(`${FAVORITES_KEY_PREFIX}${locationId}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveFavorites(locationId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${FAVORITES_KEY_PREFIX}${locationId}`, JSON.stringify([...ids]));
  } catch {
    // Storage full — silently ignore
  }
}

function loadCachedCatalog(locationId: string): CachedCatalog | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${locationId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedCatalog;
  } catch {
    return null;
  }
}

function saveCachedCatalog(
  locationId: string,
  items: POSRawItem[],
  categories: POSRawCategory[],
): void {
  if (typeof window === 'undefined') return;
  try {
    const cached: CachedCatalog = { items, categories, cachedAt: Date.now() };
    sessionStorage.setItem(`${CACHE_KEY_PREFIX}${locationId}`, JSON.stringify(cached));
  } catch {
    // Storage full — silently ignore
  }
}

/**
 * Walk up the category tree from a category to find its root department.
 * categoryMap: id -> CategoryRow
 */
function findDepartmentId(categoryId: string, categoryMap: Map<string, CategoryRow>): string {
  let current = categoryMap.get(categoryId);
  if (!current) return categoryId;

  // Walk up until we hit a root (parentId === null)
  while (current && current.parentId !== null) {
    const parent = categoryMap.get(current.parentId);
    if (!parent) break;
    current = parent;
  }

  return current?.id ?? categoryId;
}

function buildCategoryMap(categories: POSRawCategory[]): Map<string, CategoryRow> {
  const map = new Map<string, CategoryRow>();
  for (const cat of categories) {
    map.set(cat.id, {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder,
      isActive: true, // POS endpoint only returns active categories
    });
  }
  return map;
}

function convertToPOSItem(
  item: POSRawItem,
  categoryMap: Map<string, CategoryRow>,
): CatalogItemForPOS {
  const categoryId = item.categoryId ?? '';
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    barcode: item.barcode,
    type: item.itemType,
    typeGroup: getItemTypeGroup(item.itemType, item.metadata ?? {}),
    price: Math.round(parseFloat(item.defaultPrice) * 100),
    isTrackInventory: item.isTrackable,
    onHand: null, // V1 — inventory module not wired yet
    metadata: item.metadata ?? {},
    tax: { calculationMode: item.priceIncludesTax ? 'inclusive' : 'exclusive', taxRates: [] },
    categoryId,
    departmentId: categoryId ? findDepartmentId(categoryId, categoryMap) : '',
  };
}

function processCatalogData(
  rawItems: POSRawItem[],
  rawCategories: POSRawCategory[],
): { posItems: CatalogItemForPOS[]; categories: CategoryRow[]; catMap: Map<string, CategoryRow> } {
  const catMap = buildCategoryMap(rawCategories);
  const posItems = rawItems.map((item) => convertToPOSItem(item, catMap));
  const categories = Array.from(catMap.values());
  return { posItems, categories, catMap };
}

// ── Hook ───────────────────────────────────────────────────────────

export function useCatalogForPOS(locationId: string, isActive = true) {
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  toastRef.current = toast;

  // Raw data
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  const [allItems, setAllItems] = useState<CatalogItemForPOS[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation
  const [nav, setNav] = useState<CatalogNavState>({
    departmentId: null,
    subDepartmentId: null,
    categoryId: null,
  });

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Favorites
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => loadFavorites(locationId));

  // Recent (session-scoped, in-memory)
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Category map ref for quick lookup
  const categoryMapRef = useRef<Map<string, CategoryRow>>(new Map());

  // ── Fetch fresh catalog from API ────────────────────────────────

  const fetchCatalog = useCallback(async (showLoading: boolean) => {
    if (showLoading) setIsLoading(true);
    try {
      const res = await apiFetch<{
        data: { items: POSRawItem[]; categories: POSRawCategory[] };
      }>('/api/v1/catalog/pos');
      saveCachedCatalog(locationId, res.data.items, res.data.categories);
      const { posItems, categories, catMap } = processCatalogData(
        res.data.items,
        res.data.categories,
      );
      categoryMapRef.current = catMap;
      setAllCategories(categories);
      setAllItems(posItems);
    } catch (err) {
      if (showLoading) {
        const e = err instanceof Error ? err : new Error('Failed to load catalog');
        toastRef.current.error(e.message);
      }
      // Silent failure for background refreshes — stale cache is still usable
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [locationId]);

  // ── Load catalog via lean POS endpoint + sessionStorage cache ──

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      // 1. Try sessionStorage cache first — instant load
      const cached = loadCachedCatalog(locationId);
      if (cached) {
        const { posItems, categories, catMap } = processCatalogData(
          cached.items,
          cached.categories,
        );
        categoryMapRef.current = catMap;
        setAllCategories(categories);
        setAllItems(posItems);
        setIsLoading(false);

        // Background refresh — don't show loading spinner
        if (!cancelled) await fetchCatalog(false);
        return;
      }

      // 2. No cache — fetch and show loading
      if (!cancelled) await fetchCatalog(true);
    }

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [locationId, fetchCatalog]);

  // ── Periodic refresh to keep catalog current during long shifts ──
  // Only the active POS mode refreshes — the inactive one is CSS-hidden
  // and doesn't need to poll. This halves background API calls.

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      fetchCatalog(false);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCatalog, isActive]);

  // ── Refresh catalog when tab resumes from idle ──────────────────
  // Listens for the 'pos-visibility-resume' event dispatched by the
  // POS layout's visibilitychange handler. Only the active mode responds.

  useEffect(() => {
    if (!isActive) return;
    const handleResume = () => fetchCatalog(false);
    window.addEventListener('pos-visibility-resume', handleResume);
    return () => window.removeEventListener('pos-visibility-resume', handleResume);
  }, [fetchCatalog, isActive]);

  // ── Category hierarchy maps ────────────────────────────────────

  // Departments: top-level categories (parentId === null)
  const departments = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories],
  );

  // Children by parentId
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const cat of allCategories) {
      if (cat.parentId !== null) {
        const siblings = map.get(cat.parentId) ?? [];
        siblings.push(cat);
        map.set(cat.parentId, siblings);
      }
    }
    // Sort each group
    for (const siblings of map.values()) {
      siblings.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [allCategories]);

  // Items by categoryId
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, CatalogItemForPOS[]>();
    for (const item of allItems) {
      const list = map.get(item.categoryId) ?? [];
      list.push(item);
      map.set(item.categoryId, list);
    }
    return map;
  }, [allItems]);

  // ── Navigation setters ─────────────────────────────────────────

  const setDepartment = useCallback((id: string | null) => {
    setNav({ departmentId: id, subDepartmentId: null, categoryId: null });
  }, []);

  const setSubDepartment = useCallback(
    (id: string | null) => {
      setNav((prev) => ({ ...prev, subDepartmentId: id, categoryId: null }));
    },
    [],
  );

  const setCategory = useCallback((id: string | null) => {
    setNav((prev) => ({ ...prev, categoryId: id }));
  }, []);

  // ── Derived navigation data ────────────────────────────────────

  const currentSubDepartments = useMemo(() => {
    if (!nav.departmentId) return [];
    return childrenByParent.get(nav.departmentId) ?? [];
  }, [nav.departmentId, childrenByParent]);

  const currentCategories = useMemo(() => {
    if (!nav.subDepartmentId) return [];
    return childrenByParent.get(nav.subDepartmentId) ?? [];
  }, [nav.subDepartmentId, childrenByParent]);

  const currentItems = useMemo(() => {
    // If a category is selected, show items in that category
    if (nav.categoryId) {
      return itemsByCategory.get(nav.categoryId) ?? [];
    }

    // If a sub-department is selected, show items in all child categories
    if (nav.subDepartmentId) {
      const cats = childrenByParent.get(nav.subDepartmentId) ?? [];
      const items: CatalogItemForPOS[] = [];
      for (const cat of cats) {
        const catItems = itemsByCategory.get(cat.id) ?? [];
        items.push(...catItems);
      }
      return items;
    }

    // If a department is selected, show all items under it
    if (nav.departmentId) {
      const subDepts = childrenByParent.get(nav.departmentId) ?? [];
      const items: CatalogItemForPOS[] = [];
      for (const subDept of subDepts) {
        const cats = childrenByParent.get(subDept.id) ?? [];
        for (const cat of cats) {
          const catItems = itemsByCategory.get(cat.id) ?? [];
          items.push(...catItems);
        }
        // Also include items directly in the subdepartment
        const directItems = itemsByCategory.get(subDept.id) ?? [];
        items.push(...directItems);
      }
      // Include items directly in the department
      const directItems = itemsByCategory.get(nav.departmentId) ?? [];
      items.push(...directItems);
      return items;
    }

    // No selection — return all items
    return allItems;
  }, [nav.categoryId, nav.subDepartmentId, nav.departmentId, childrenByParent, itemsByCategory, allItems]);

  // ── Breadcrumb ─────────────────────────────────────────────────

  const breadcrumb = useMemo(() => {
    const crumbs: Array<{ level: CatalogNavLevel; id: string; name: string }> = [];
    const catMap = categoryMapRef.current;

    if (nav.departmentId) {
      const dept = catMap.get(nav.departmentId);
      if (dept) crumbs.push({ level: 'department', id: dept.id, name: dept.name });
    }
    if (nav.subDepartmentId) {
      const subDept = catMap.get(nav.subDepartmentId);
      if (subDept) crumbs.push({ level: 'subdepartment', id: subDept.id, name: subDept.name });
    }
    if (nav.categoryId) {
      const cat = catMap.get(nav.categoryId);
      if (cat) crumbs.push({ level: 'category', id: cat.id, name: cat.name });
    }

    return crumbs;
  }, [nav]);

  // ── Search ─────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    return allItems.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true;
      if (item.sku && item.sku.toLowerCase().includes(q)) return true;
      if (item.barcode && item.barcode.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [searchQuery, allItems]);

  // ── Barcode Lookup ─────────────────────────────────────────────

  const lookupByBarcode = useCallback(
    (code: string): CatalogItemForPOS | null => {
      const trimmed = code.trim();
      if (!trimmed) return null;
      return allItems.find((item) => item.barcode === trimmed) ?? null;
    },
    [allItems],
  );

  // ── Favorites ──────────────────────────────────────────────────

  const toggleFavorite = useCallback(
    (itemId: string) => {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        saveFavorites(locationId, next);
        return next;
      });
    },
    [locationId],
  );

  const favorites = useMemo(() => {
    return allItems.filter((item) => favoriteIds.has(item.id));
  }, [allItems, favoriteIds]);

  // ── Recent Items ───────────────────────────────────────────────

  const addToRecent = useCallback(
    (itemId: string) => {
      setRecentIds((prev) => {
        const filtered = prev.filter((id) => id !== itemId);
        const next = [itemId, ...filtered].slice(0, MAX_RECENT_ITEMS);
        return next;
      });
    },
    [],
  );

  const allItemsMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);
  const recentItems = useMemo(() => recentIds.map((id) => allItemsMap.get(id)).filter(Boolean) as CatalogItemForPOS[], [recentIds, allItemsMap]);

  // ── Reload favorites when locationId changes ───────────────────

  useEffect(() => {
    setFavoriteIds(loadFavorites(locationId));
  }, [locationId]);

  return {
    // Hierarchy
    departments,
    nav,
    setDepartment,
    setSubDepartment,
    setCategory,

    // Derived navigation
    currentSubDepartments,
    currentCategories,
    currentItems,

    // Breadcrumb
    breadcrumb,

    // Search
    searchQuery,
    setSearchQuery,
    searchResults,
    lookupByBarcode,

    // Favorites & Recent
    favorites,
    toggleFavorite,
    isFavorite: useCallback((itemId: string) => favoriteIds.has(itemId), [favoriteIds]),
    recentItems,
    addToRecent,

    // Loading state
    isLoading,

    // Full item list (for pre-seed lookups when opening edit drawer)
    allItems,

    // Manual refresh (e.g., after item-not-found error to purge stale items)
    refresh: useCallback(() => fetchCatalog(false), [fetchCatalog]),
  };
}

/**
 * Preload the POS catalog into sessionStorage so it's ready instantly
 * when the user navigates to the POS page. Call this from the dashboard
 * layout on mount — it only fetches if no cache exists yet.
 */
export function preloadPOSCatalog(locationId: string): void {
  if (typeof window === 'undefined') return;
  // Already cached — nothing to do
  if (loadCachedCatalog(locationId)) return;

  apiFetch<{ data: { items: POSRawItem[]; categories: POSRawCategory[] } }>('/api/v1/catalog/pos')
    .then((res) => {
      saveCachedCatalog(locationId, res.data.items, res.data.categories);
    })
    .catch(() => {
      // Non-critical — POS will fetch on mount if preload fails
    });
}
