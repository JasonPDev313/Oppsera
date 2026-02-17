'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { getItemTypeGroup } from '@oppsera/shared';
import type { CatalogItemRow, CategoryRow } from '@/types/catalog';
import type { CatalogItemForPOS, CatalogNavState, CatalogNavLevel } from '@/types/pos';

// ── Constants ──────────────────────────────────────────────────────

const FAVORITES_KEY_PREFIX = 'pos_favorites_';
const MAX_RECENT_ITEMS = 20;

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

function convertToPOSItem(
  item: CatalogItemRow,
  categoryMap: Map<string, CategoryRow>,
): CatalogItemForPOS {
  const categoryId = item.categoryId ?? '';
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    barcode: item.barcode,
    type: item.itemType,
    typeGroup: getItemTypeGroup(item.itemType, item.metadata),
    price: Math.round(parseFloat(item.defaultPrice) * 100),
    isTrackInventory: item.isTrackable,
    onHand: null, // V1 — inventory module not built yet
    metadata: item.metadata ?? {},
    tax: { calculationMode: 'exclusive', taxRates: [] }, // V1 placeholder
    categoryId,
    departmentId: categoryId ? findDepartmentId(categoryId, categoryMap) : '',
  };
}

// ── Hook ───────────────────────────────────────────────────────────

export function useCatalogForPOS(locationId: string) {
  const { toast } = useToast();

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

  // ── Load all categories and items ──────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      try {
        // Fetch categories and first page of items in parallel
        const [catRes, itemsFirstPage] = await Promise.all([
          apiFetch<{ data: CategoryRow[] }>('/api/v1/catalog/categories'),
          apiFetch<{ data: { items: CatalogItemRow[]; nextCursor: string | null } }>(
            '/api/v1/catalog/items?isActive=true&limit=500',
          ),
        ]);

        if (cancelled) return;

        const categories = catRes.data;
        let rawItems = itemsFirstPage.data.items;
        let nextCursor = itemsFirstPage.data.nextCursor;

        // Paginate through remaining items
        while (nextCursor) {
          const page = await apiFetch<{
            data: { items: CatalogItemRow[]; nextCursor: string | null };
          }>(`/api/v1/catalog/items?isActive=true&limit=500&cursor=${nextCursor}`);

          if (cancelled) return;

          rawItems = [...rawItems, ...page.data.items];
          nextCursor = page.data.nextCursor;
        }

        // Build category map
        const catMap = new Map<string, CategoryRow>();
        for (const cat of categories) {
          catMap.set(cat.id, cat);
        }
        categoryMapRef.current = catMap;

        // Convert items
        const posItems = rawItems.map((item) => convertToPOSItem(item, catMap));

        setAllCategories(categories);
        setAllItems(posItems);
      } catch (err) {
        if (cancelled) return;
        const e = err instanceof Error ? err : new Error('Failed to load catalog');
        toast.error(e.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [locationId, toast]);

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
  }, [nav, childrenByParent, itemsByCategory, allItems]);

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

  const recentItems = useMemo(() => {
    const itemMap = new Map(allItems.map((item) => [item.id, item]));
    return recentIds.map((id) => itemMap.get(id)).filter(Boolean) as CatalogItemForPOS[];
  }, [recentIds, allItems]);

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
    recentItems,
    addToRecent,

    // Loading state
    isLoading,
  };
}
