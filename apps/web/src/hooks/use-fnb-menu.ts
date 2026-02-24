'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ── Types ───────────────────────────────────────────────────────

interface FnbMenuCategory {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
}

interface FnbMenuItem {
  id: string;
  name: string;
  sku: string | null;
  itemType: string;
  unitPriceCents: number;
  categoryId: string;
  subDepartmentId: string | null;
  is86d: boolean;
  allergenIds: string[];
  metadata: Record<string, unknown> | null;
}

interface AllergenItem {
  id: string;
  name: string;
  icon: string | null;
  severity: string;
}

// ── Raw API types (what /api/v1/catalog/pos returns) ────────────

interface RawPOSItem {
  id: string;
  name: string;
  sku: string | null;
  itemType: string;
  defaultPrice: string;
  metadata: Record<string, unknown> | null;
  categoryId: string | null;
}

interface RawPOSCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Compute depth for each category by walking parent chain */
function computeDepthMap(cats: RawPOSCategory[]): Map<string, number> {
  const lookup = new Map(cats.map((c) => [c.id, c]));
  const depths = new Map<string, number>();

  function resolve(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    const cat = lookup.get(id);
    if (!cat?.parentId || !lookup.has(cat.parentId)) {
      depths.set(id, 0);
      return 0;
    }
    const d = resolve(cat.parentId) + 1;
    depths.set(id, d);
    return d;
  }

  for (const cat of cats) resolve(cat.id);
  return depths;
}

/** Walk up from a category to find its depth-1 ancestor (sub-department) */
function findSubDeptId(
  categoryId: string | null,
  depths: Map<string, number>,
  catLookup: Map<string, RawPOSCategory>,
): string | null {
  if (!categoryId) return null;
  let current = catLookup.get(categoryId);
  while (current) {
    if (depths.get(current.id) === 1) return current.id;
    if (!current.parentId) return null;
    current = catLookup.get(current.parentId);
  }
  return null;
}

// ── Module-level menu cache ─────────────────────────────────────
// Survives component re-renders and re-mounts. Same pattern as
// useFnbFloor's snapshot cache. Prevents refetching catalog on
// every floor→tab switch.

interface MenuCacheEntry {
  categories: FnbMenuCategory[];
  items: FnbMenuItem[];
  allergens: AllergenItem[];
  ts: number;
}

const MENU_CACHE_TTL_MS = 5 * 60_000; // 5 minutes — fresh enough for a shift
let _menuCache: MenuCacheEntry | null = null;
let _menuFetchPromise: Promise<MenuCacheEntry> | null = null; // dedup in-flight requests

function getMenuCache(): MenuCacheEntry | null {
  if (!_menuCache) return null;
  if (Date.now() - _menuCache.ts > MENU_CACHE_TTL_MS) {
    _menuCache = null;
    return null;
  }
  return _menuCache;
}

function setMenuCache(entry: MenuCacheEntry): void {
  _menuCache = entry;
}

/** Force-expire the cache (called after 86/restore actions) */
function invalidateMenuCache(): void {
  _menuCache = null;
  _menuFetchPromise = null;
}

// ── F&B Menu Hook ───────────────────────────────────────────────

export interface UseFnbMenuReturn {
  departments: FnbMenuCategory[];
  subDepartments: FnbMenuCategory[];
  categories: FnbMenuCategory[];
  items: FnbMenuItem[];
  allergens: AllergenItem[];
  activeDepartmentId: string | null;
  activeSubDepartmentId: string | null;
  activeCategoryId: string | null;
  setActiveDepartment: (id: string) => void;
  setActiveSubDepartment: (id: string | null) => void;
  setActiveCategory: (id: string | null) => void;
  filteredItems: FnbMenuItem[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  eightySixItem: (catalogItemId: string) => Promise<void>;
  restoreItem: (catalogItemId: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Fetch and process catalog data (shared between instances via _menuFetchPromise) */
async function fetchAndProcessMenu(): Promise<MenuCacheEntry> {
  // Fetch catalog; allergens load in background (non-blocking)
  const catResult = await apiFetch<{ data: { items: RawPOSItem[]; categories: RawPOSCategory[] } }>(
    '/api/v1/catalog/pos',
  );

  const rawItems = catResult.data.items ?? [];
  const rawCats = catResult.data.categories ?? [];

  // Build depth map and lookup from flat categories
  const depthMap = computeDepthMap(rawCats);
  const catLookup = new Map(rawCats.map((c) => [c.id, c]));

  // Transform flat categories → FnbMenuCategory with depth
  const allCats: FnbMenuCategory[] = rawCats.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    depth: depthMap.get(c.id) ?? 0,
    sortOrder: c.sortOrder,
  }));

  // Filter to F&B items and transform to hook's format
  const fnbItems: FnbMenuItem[] = rawItems
    .filter((i) => {
      if (i.itemType === 'food' || i.itemType === 'beverage') return true;
      if (i.metadata && (i.metadata as Record<string, unknown>).isPackage) {
        const components = (i.metadata as Record<string, unknown>).packageComponents as
          | Array<{ itemType?: string }>
          | undefined;
        return components?.some(
          (c) => c.itemType === 'food' || c.itemType === 'beverage',
        ) ?? false;
      }
      return false;
    })
    .map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      itemType: i.itemType,
      unitPriceCents: Math.round(parseFloat(i.defaultPrice || '0') * 100),
      categoryId: i.categoryId ?? '',
      subDepartmentId: findSubDeptId(i.categoryId, depthMap, catLookup),
      is86d: false,
      allergenIds: [] as string[],
      metadata: i.metadata,
    }));

  // Build set of category IDs that contain at least one F&B item
  const fnbCategoryIds = new Set(fnbItems.map((i) => i.categoryId));

  // Walk UP from each F&B item's category to find which departments contain F&B items
  const deptIdsWithItems = new Set<string>();
  for (const catId of fnbCategoryIds) {
    let cur = catLookup.get(catId);
    while (cur) {
      if (depthMap.get(cur.id) === 0) {
        deptIdsWithItems.add(cur.id);
        break;
      }
      if (!cur.parentId) break;
      cur = catLookup.get(cur.parentId);
    }
    if (depthMap.get(catId) === 0) deptIdsWithItems.add(catId);
  }

  // Keep only categories that have F&B items at any descendant level
  const activeDeptIds = new Set(
    allCats.filter((c) => c.depth === 0 && deptIdsWithItems.has(c.id)).map((c) => c.id),
  );
  const activeSubDeptIds = new Set(
    allCats
      .filter((c) => c.depth === 1 && c.parentId != null && activeDeptIds.has(c.parentId))
      .map((c) => c.id),
  );
  const activeCatIds = new Set(
    allCats
      .filter((c) => c.depth === 2 && c.parentId != null && activeSubDeptIds.has(c.parentId))
      .map((c) => c.id),
  );

  const filteredCats = allCats.filter((c) => {
    if (c.depth === 0) return activeDeptIds.has(c.id);
    if (c.depth === 1) return activeSubDeptIds.has(c.id);
    if (c.depth === 2) return activeCatIds.has(c.id);
    return false;
  });

  return {
    categories: filteredCats,
    items: fnbItems,
    allergens: [], // loaded separately, non-blocking
    ts: Date.now(),
  };
}

export function useFnbMenu(): UseFnbMenuReturn {
  // Initialize from cache instantly if available
  const cached = getMenuCache();
  const [allCategories, setAllCategories] = useState<FnbMenuCategory[]>(cached?.categories ?? []);
  const [items, setItems] = useState<FnbMenuItem[]>(cached?.items ?? []);
  const [allergens, setAllergens] = useState<AllergenItem[]>(cached?.allergens ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [activeDepartmentId, setActiveDepartment] = useState<string | null>(null);
  const [activeSubDepartmentId, setActiveSubDepartment] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const initialDeptSetRef = useRef(false);

  // Auto-select first department from cached data on mount
  useEffect(() => {
    if (cached && !initialDeptSetRef.current) {
      const depts = cached.categories.filter((c) => c.depth === 0);
      if (depts.length > 0) {
        initialDeptSetRef.current = true;
        setActiveDepartment(depts[0]!.id);
      }
    }
  }, []);

  const applyData = useCallback((entry: MenuCacheEntry) => {
    setAllCategories(entry.categories);
    setItems(entry.items);
    if (entry.allergens.length > 0) setAllergens(entry.allergens);

    // Auto-select first department once
    if (!initialDeptSetRef.current) {
      const depts = entry.categories.filter((c) => c.depth === 0);
      if (depts.length > 0) {
        initialDeptSetRef.current = true;
        setActiveDepartment(depts[0]!.id);
      }
    }
    setError(null);
  }, []);

  const fetchMenu = useCallback(async (force = false) => {
    try {
      // Check cache first (unless forced)
      if (!force) {
        const hit = getMenuCache();
        if (hit) {
          applyData(hit);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      // Dedup concurrent fetches (e.g. if multiple hook instances mount)
      if (!_menuFetchPromise || force) {
        _menuFetchPromise = fetchAndProcessMenu();
      }
      const entry = await _menuFetchPromise;
      _menuFetchPromise = null;

      setMenuCache(entry);
      applyData(entry);

      // Fire-and-forget allergen fetch (non-blocking — don't delay items)
      apiFetch<{ data: AllergenItem[] }>('/api/v1/fnb/menu/allergens')
        .then((res) => {
          const loaded = res.data ?? [];
          if (loaded.length > 0) {
            setAllergens(loaded);
            // Update cache with allergens
            const current = getMenuCache();
            if (current) setMenuCache({ ...current, allergens: loaded });
          }
        })
        .catch(() => { /* non-critical */ });
    } catch (e) {
      _menuFetchPromise = null;
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [applyData]);

  // Initial load: use cache or fetch
  useEffect(() => {
    const hit = getMenuCache();
    if (hit) {
      // Already initialized from cache in useState — just ensure dept is set
      applyData(hit);
      setIsLoading(false);
    } else {
      fetchMenu();
    }
  }, [fetchMenu, applyData]);

  // Background refresh every 5 minutes to pick up catalog changes during a shift
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMenu(true);
    }, MENU_CACHE_TTL_MS);
    return () => clearInterval(interval);
  }, [fetchMenu]);

  // Derive hierarchy from active selections
  const departments = useMemo(
    () =>
      allCategories
        .filter((c) => c.depth === 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories],
  );

  const subDepartments = useMemo(
    () =>
      allCategories
        .filter((c) => c.depth === 1 && c.parentId === activeDepartmentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories, activeDepartmentId],
  );

  const categoriesList = useMemo(
    () =>
      allCategories
        .filter(
          (c) =>
            c.depth === 2 &&
            (activeSubDepartmentId
              ? c.parentId === activeSubDepartmentId
              : subDepartments.some((sd) => sd.id === c.parentId)),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories, activeSubDepartmentId, subDepartments],
  );

  // Filter items by navigation state / search
  const filteredItems = useMemo(() => {
    let result = items;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q),
      );
    } else {
      if (activeCategoryId) {
        result = result.filter((i) => i.categoryId === activeCategoryId);
      } else if (activeSubDepartmentId) {
        const catIds = new Set(categoriesList.map((c) => c.id));
        // Also include items directly in the sub-department
        result = result.filter(
          (i) => catIds.has(i.categoryId) || i.categoryId === activeSubDepartmentId,
        );
      } else if (activeDepartmentId) {
        // All items under this department (through sub-depts and categories)
        const sdIds = new Set(subDepartments.map((sd) => sd.id));
        const catIds = new Set(
          allCategories
            .filter((c) => c.depth === 2 && sdIds.has(c.parentId ?? ''))
            .map((c) => c.id),
        );
        // Items directly in sub-departments or categories under this department
        const deptChildIds = new Set(
          allCategories.filter((c) => c.parentId === activeDepartmentId).map((c) => c.id),
        );
        result = result.filter(
          (i) =>
            catIds.has(i.categoryId) ||
            deptChildIds.has(i.categoryId) ||
            i.categoryId === activeDepartmentId,
        );
      }
    }

    return result;
  }, [
    items,
    searchQuery,
    activeCategoryId,
    activeSubDepartmentId,
    activeDepartmentId,
    subDepartments,
    categoriesList,
    allCategories,
  ]);

  // 86 actions — invalidate cache to force fresh fetch
  const eightySixItemFn = useCallback(
    async (catalogItemId: string) => {
      await apiFetch('/api/v1/fnb/menu/eighty-six', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId }),
      });
      invalidateMenuCache();
      await fetchMenu(true);
    },
    [fetchMenu],
  );

  const restoreItemFn = useCallback(
    async (catalogItemId: string) => {
      await apiFetch('/api/v1/fnb/menu/restore', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId }),
      });
      invalidateMenuCache();
      await fetchMenu(true);
    },
    [fetchMenu],
  );

  return {
    departments,
    subDepartments,
    categories: categoriesList,
    items,
    allergens,
    activeDepartmentId,
    activeSubDepartmentId,
    activeCategoryId,
    setActiveDepartment,
    setActiveSubDepartment,
    setActiveCategory,
    filteredItems,
    searchQuery,
    setSearchQuery,
    eightySixItem: eightySixItemFn,
    restoreItem: restoreItemFn,
    isLoading,
    error,
    refresh: useCallback(() => {
      invalidateMenuCache();
      return fetchMenu(true);
    }, [fetchMenu]),
  };
}
