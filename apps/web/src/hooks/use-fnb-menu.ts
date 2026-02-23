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

// ── F&B Menu Hook ───────────────────────────────────────────────

interface UseFnbMenuReturn {
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

export function useFnbMenu(): UseFnbMenuReturn {
  const [allCategories, setAllCategories] = useState<FnbMenuCategory[]>([]);
  const [items, setItems] = useState<FnbMenuItem[]>([]);
  const [allergens, setAllergens] = useState<AllergenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDepartmentId, setActiveDepartment] = useState<string | null>(null);
  const [activeSubDepartmentId, setActiveSubDepartment] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const initialDeptSetRef = useRef(false);

  const fetchMenu = useCallback(async () => {
    try {
      setIsLoading(true);

      // Fetch catalog (GET) and allergens in parallel; allergens non-critical
      const [catResult, allergResult] = await Promise.allSettled([
        apiFetch<{ data: { items: RawPOSItem[]; categories: RawPOSCategory[] } }>(
          '/api/v1/catalog/pos',
        ),
        apiFetch<{ data: AllergenItem[] }>('/api/v1/fnb/menu/allergens'),
      ]);

      if (catResult.status === 'rejected') {
        throw catResult.reason instanceof Error
          ? catResult.reason
          : new Error('Failed to load menu');
      }

      const rawItems = catResult.value.data.items ?? [];
      const rawCats = catResult.value.data.categories ?? [];
      const loadedAllergens =
        allergResult.status === 'fulfilled' ? (allergResult.value.data ?? []) : [];

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
          // Include packages containing F&B components
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

      setItems(fnbItems);

      // Build set of category IDs that contain at least one F&B item, then filter hierarchy
      const fnbCategoryIds = new Set(fnbItems.map((i) => i.categoryId));

      // Keep depth-2 categories that have F&B items
      const activeCatIds = new Set(
        allCats
          .filter((c) => c.depth === 2 && fnbCategoryIds.has(c.id))
          .map((c) => c.id),
      );
      // Keep depth-1 sub-departments with active child categories or direct F&B items
      const activeSubDeptIds = new Set(
        allCats
          .filter(
            (c) =>
              c.depth === 1 &&
              (fnbCategoryIds.has(c.id) ||
                allCats.some((ch) => ch.parentId === c.id && activeCatIds.has(ch.id))),
          )
          .map((c) => c.id),
      );
      // Keep depth-0 departments with active children or direct F&B items
      const activeDeptIds = new Set(
        allCats
          .filter(
            (c) =>
              c.depth === 0 &&
              (fnbCategoryIds.has(c.id) ||
                allCats.some(
                  (ch) =>
                    ch.parentId === c.id &&
                    (activeSubDeptIds.has(ch.id) || activeCatIds.has(ch.id)),
                )),
          )
          .map((c) => c.id),
      );

      const filteredCats = allCats.filter((c) => {
        if (c.depth === 0) return activeDeptIds.has(c.id);
        if (c.depth === 1) return activeSubDeptIds.has(c.id);
        if (c.depth === 2) return activeCatIds.has(c.id);
        return false;
      });
      setAllCategories(filteredCats);
      setAllergens(loadedAllergens);

      // Auto-select first department once
      const fnbDepts = filteredCats.filter((c) => c.depth === 0);
      if (fnbDepts.length > 0 && !initialDeptSetRef.current) {
        initialDeptSetRef.current = true;
        setActiveDepartment(fnbDepts[0]!.id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
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

  // 86 actions
  const eightySixItemFn = useCallback(
    async (catalogItemId: string) => {
      await apiFetch('/api/v1/fnb/menu/eighty-six', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId }),
      });
      await fetchMenu();
    },
    [fetchMenu],
  );

  const restoreItemFn = useCallback(
    async (catalogItemId: string) => {
      await apiFetch('/api/v1/fnb/menu/restore', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId }),
      });
      await fetchMenu();
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
    refresh: fetchMenu,
  };
}
