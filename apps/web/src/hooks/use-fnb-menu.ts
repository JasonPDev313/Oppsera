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

// ── F&B Menu Hook ───────────────────────────────────────────────

interface UseFnbMenuReturn {
  // Category hierarchy
  departments: FnbMenuCategory[];
  subDepartments: FnbMenuCategory[];
  categories: FnbMenuCategory[];
  // Items
  items: FnbMenuItem[];
  allergens: AllergenItem[];
  // Navigation state
  activeDepartmentId: string | null;
  activeSubDepartmentId: string | null;
  activeCategoryId: string | null;
  setActiveDepartment: (id: string) => void;
  setActiveSubDepartment: (id: string | null) => void;
  setActiveCategory: (id: string | null) => void;
  // Filtered items
  filteredItems: FnbMenuItem[];
  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  // 86 actions
  eightySixItem: (catalogItemId: string) => Promise<void>;
  restoreItem: (catalogItemId: string) => Promise<void>;
  // State
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

  // Track whether initial department auto-select has been done (ref to avoid re-fetch)
  const initialDeptSetRef = useRef(false);

  // Load catalog + allergens (stable callback — no state deps that trigger re-fetch)
  const fetchMenu = useCallback(async () => {
    try {
      setIsLoading(true);
      const [catRes, allergRes] = await Promise.all([
        apiFetch<{ data: { items: FnbMenuItem[]; departments: FnbMenuCategory[]; subDepartments: FnbMenuCategory[]; categories: FnbMenuCategory[] } }>('/api/v1/catalog/pos', {
          method: 'POST',
          body: JSON.stringify({}),
        }),
        apiFetch<{ data: AllergenItem[] }>('/api/v1/fnb/menu/allergens'),
      ]);
      setItems(catRes.data.items ?? []);
      setAllCategories([
        ...(catRes.data.departments ?? []),
        ...(catRes.data.subDepartments ?? []),
        ...(catRes.data.categories ?? []),
      ]);
      setAllergens(allergRes.data ?? []);

      // Auto-select first department only once (ref prevents re-fetch loop)
      if (catRes.data.departments?.length && !initialDeptSetRef.current) {
        initialDeptSetRef.current = true;
        setActiveDepartment(catRes.data.departments[0]!.id);
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

  // Derive hierarchy
  const departments = useMemo(
    () => allCategories.filter((c) => c.depth === 0).sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories],
  );

  const subDepartments = useMemo(
    () => allCategories.filter((c) => c.depth === 1 && c.parentId === activeDepartmentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories, activeDepartmentId],
  );

  const categoriesList = useMemo(
    () => allCategories
      .filter((c) => c.depth === 2 && (activeSubDepartmentId ? c.parentId === activeSubDepartmentId : subDepartments.some((sd) => sd.id === c.parentId)))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    [allCategories, activeSubDepartmentId, subDepartments],
  );

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
    } else {
      // Category filter
      if (activeCategoryId) {
        result = result.filter((i) => i.categoryId === activeCategoryId);
      } else if (activeSubDepartmentId) {
        const catIds = new Set(categoriesList.map((c) => c.id));
        result = result.filter((i) => catIds.has(i.categoryId));
      } else if (activeDepartmentId) {
        const sdIds = new Set(subDepartments.map((sd) => sd.id));
        const catIds = new Set(allCategories.filter((c) => c.depth === 2 && sdIds.has(c.parentId ?? '')).map((c) => c.id));
        // Also include items directly in categories under this department
        const deptCatIds = new Set(allCategories.filter((c) => c.parentId === activeDepartmentId).map((c) => c.id));
        result = result.filter((i) => catIds.has(i.categoryId) || deptCatIds.has(i.categoryId));
      }
    }

    return result;
  }, [items, searchQuery, activeCategoryId, activeSubDepartmentId, activeDepartmentId, subDepartments, categoriesList, allCategories]);

  // 86 actions
  const eightySixItemFn = useCallback(async (catalogItemId: string) => {
    await apiFetch('/api/v1/fnb/menu/eighty-six', {
      method: 'POST',
      body: JSON.stringify({ catalogItemId }),
    });
    await fetchMenu();
  }, [fetchMenu]);

  const restoreItemFn = useCallback(async (catalogItemId: string) => {
    await apiFetch('/api/v1/fnb/menu/restore', {
      method: 'POST',
      body: JSON.stringify({ catalogItemId }),
    });
    await fetchMenu();
  }, [fetchMenu]);

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
