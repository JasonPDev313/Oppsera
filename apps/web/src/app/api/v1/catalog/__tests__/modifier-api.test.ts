import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockListModifierGroupCategories,
  mockCreateModifierGroupCategory,
  mockUpdateModifierGroupCategory,
  mockDeleteModifierGroupCategory,
  mockListModifierGroups,
  mockCreateModifierGroup,
  mockGetModifierGroup,
  mockUpdateModifierGroup,
  mockBulkAssignModifierGroups,
  mockGetItemModifierAssignments,
  mockUpdateItemModifierAssignment,
  mockRemoveItemModifierAssignment,
  mockWithMiddleware,
} = vi.hoisted(() => {
  const mockListModifierGroupCategories = vi.fn();
  const mockCreateModifierGroupCategory = vi.fn();
  const mockUpdateModifierGroupCategory = vi.fn();
  const mockDeleteModifierGroupCategory = vi.fn();
  const mockListModifierGroups = vi.fn();
  const mockCreateModifierGroup = vi.fn();
  const mockGetModifierGroup = vi.fn();
  const mockUpdateModifierGroup = vi.fn();
  const mockBulkAssignModifierGroups = vi.fn();
  const mockGetItemModifierAssignments = vi.fn();
  const mockUpdateItemModifierAssignment = vi.fn();
  const mockRemoveItemModifierAssignment = vi.fn();

  const mockWithMiddleware = vi.fn(
    (handler: (...args: any[]) => any, _options: unknown) => {
      return async (request: any) => {
        const ctx = {
          user: { id: 'user_001' },
          tenantId: 'tenant_001',
          locationId: undefined as string | undefined,
          requestId: 'req_001',
          isPlatformAdmin: false,
        };
        return handler(request, ctx);
      };
    },
  );

  return {
    mockListModifierGroupCategories,
    mockCreateModifierGroupCategory,
    mockUpdateModifierGroupCategory,
    mockDeleteModifierGroupCategory,
    mockListModifierGroups,
    mockCreateModifierGroup,
    mockGetModifierGroup,
    mockUpdateModifierGroup,
    mockBulkAssignModifierGroups,
    mockGetItemModifierAssignments,
    mockUpdateItemModifierAssignment,
    mockRemoveItemModifierAssignment,
    mockWithMiddleware,
  };
});

// ── Module mocks ──────────────────────────────────────────────

vi.mock('@oppsera/core/auth/with-middleware', () => ({
  withMiddleware: mockWithMiddleware,
}));

vi.mock('@oppsera/module-catalog', () => ({
  listModifierGroupCategories: mockListModifierGroupCategories,
  createModifierGroupCategory: mockCreateModifierGroupCategory,
  createModifierGroupCategorySchema: {
    safeParse: (data: any) => {
      if (!data || !data.name) {
        return {
          success: false,
          error: {
            issues: [{ path: ['name'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  updateModifierGroupCategory: mockUpdateModifierGroupCategory,
  updateModifierGroupCategorySchema: {
    safeParse: (data: any) => {
      if (data && typeof data === 'object') {
        return { success: true, data };
      }
      return {
        success: false,
        error: { issues: [{ path: ['name'], message: 'Invalid' }] },
      };
    },
  },
  deleteModifierGroupCategory: mockDeleteModifierGroupCategory,
  listModifierGroups: mockListModifierGroups,
  createModifierGroup: mockCreateModifierGroup,
  createModifierGroupSchema: {
    safeParse: (data: any) => {
      if (!data || !data.name) {
        return {
          success: false,
          error: {
            issues: [{ path: ['name'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  getModifierGroup: mockGetModifierGroup,
  updateModifierGroup: mockUpdateModifierGroup,
  updateModifierGroupSchema: {
    safeParse: (data: any) => {
      if (data && typeof data === 'object') {
        return { success: true, data };
      }
      return {
        success: false,
        error: { issues: [{ path: ['name'], message: 'Invalid' }] },
      };
    },
  },
  bulkAssignModifierGroups: mockBulkAssignModifierGroups,
  bulkAssignModifierGroupsSchema: {
    safeParse: (data: any) => {
      if (!data || !data.itemIds || !Array.isArray(data.itemIds) || data.itemIds.length === 0) {
        return {
          success: false,
          error: {
            issues: [{ path: ['itemIds'], message: 'At least one itemId is required' }],
          },
        };
      }
      if (data.itemIds.length > 500) {
        return {
          success: false,
          error: {
            issues: [{ path: ['itemIds'], message: 'Cannot exceed 500 items' }],
          },
        };
      }
      if (!data.groupIds || !Array.isArray(data.groupIds)) {
        return {
          success: false,
          error: {
            issues: [{ path: ['groupIds'], message: 'Required' }],
          },
        };
      }
      return { success: true, data };
    },
  },
  getItemModifierAssignments: mockGetItemModifierAssignments,
  updateItemModifierAssignment: mockUpdateItemModifierAssignment,
  updateItemModifierAssignmentSchema: {
    safeParse: (data: any) => {
      if (data && typeof data === 'object') {
        return { success: true, data };
      }
      return {
        success: false,
        error: { issues: [{ path: ['overrides'], message: 'Invalid' }] },
      };
    },
  },
  removeItemModifierAssignment: mockRemoveItemModifierAssignment,
}));

vi.mock('@oppsera/shared', () => ({
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    details?: unknown;
    constructor(code: string, message: string, statusCode: number, details?: unknown) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.details = details;
    }
  },
  ValidationError: class ValidationError extends Error {
    code = 'VALIDATION_ERROR';
    statusCode = 400;
    details: unknown[];
    constructor(message: string, details: unknown[]) {
      super(message);
      this.details = details;
    }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(entity: string, id?: string) {
      super(id ? `${entity} ${id} not found` : `${entity} not found`);
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return { url, method: 'GET' } as any;
}

function makePostRequest(url: string, body: unknown) {
  return {
    url,
    method: 'POST',
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

function makePatchRequest(url: string, body: unknown) {
  return {
    url,
    method: 'PATCH',
    json: vi.fn().mockResolvedValue(body),
  } as any;
}

function makeDeleteRequest(url: string) {
  return { url, method: 'DELETE' } as any;
}

const BASE = 'http://localhost/api/v1/catalog';

// ── Route imports (after mocks) ──────────────────────────────

import {
  GET as categoriesGET,
  POST as categoriesPOST,
} from '../modifier-group-categories/route';

import {
  PATCH as categoryPATCH,
  DELETE as categoryDELETE,
} from '../modifier-group-categories/[id]/route';

import {
  GET as groupsGET,
  POST as groupsPOST,
} from '../modifier-groups/route';

import {
  GET as groupDetailGET,
  PATCH as groupPATCH,
} from '../modifier-groups/[id]/route';

import {
  POST as bulkAssignPOST,
} from '../modifier-groups/bulk-assign/route';

import {
  GET as itemAssignmentsGET,
} from '@/app/api/v1/catalog/items/[id]/modifier-assignments/route';

import {
  PATCH as itemAssignmentPATCH,
  DELETE as itemAssignmentDELETE,
} from '@/app/api/v1/catalog/items/[id]/modifier-assignments/[groupId]/route';

// ═══════════════════════════════════════════════════════════════
// Modifier Group Categories — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/catalog/modifier-group-categories', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns list of categories with 200', async () => {
    const categories = [
      { id: 'mgc_001', name: 'Protein Options', sortOrder: 1 },
      { id: 'mgc_002', name: 'Sauce Choices', sortOrder: 2 },
    ];
    mockListModifierGroupCategories.mockResolvedValue(categories);

    const res = await categoriesGET(makeGetRequest(`${BASE}/modifier-group-categories`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('Protein Options');
    expect(body.data[1].name).toBe('Sauce Choices');
  });

  it('returns empty array when no categories exist', async () => {
    mockListModifierGroupCategories.mockResolvedValue([]);

    const res = await categoriesGET(makeGetRequest(`${BASE}/modifier-group-categories`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Group Categories — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/catalog/modifier-group-categories', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates category and returns 201', async () => {
    const created = { id: 'mgc_new', name: 'Toppings', sortOrder: 3 };
    mockCreateModifierGroupCategory.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/modifier-group-categories`, {
      name: 'Toppings',
      sortOrder: 3,
    });
    const res = await categoriesPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('mgc_new');
    expect(body.data.name).toBe('Toppings');
  });

  it('returns 400 for missing name', async () => {
    const req = makePostRequest(`${BASE}/modifier-group-categories`, {
      sortOrder: 1,
    });

    await expect(categoriesPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Group Categories — Update
// ═══════════════════════════════════════════════════════════════

describe('PATCH /api/v1/catalog/modifier-group-categories/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates category and returns 200', async () => {
    const updated = { id: 'mgc_001', name: 'Protein Add-Ons', sortOrder: 1 };
    mockUpdateModifierGroupCategory.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/modifier-group-categories/mgc_001`, {
      name: 'Protein Add-Ons',
    });
    const res = await categoryPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Protein Add-Ons');
  });

  it('returns 404 for unknown id', async () => {
    const { NotFoundError } = await import('@oppsera/shared');
    mockUpdateModifierGroupCategory.mockRejectedValue(
      new NotFoundError('ModifierGroupCategory', 'mgc_unknown'),
    );

    const req = makePatchRequest(`${BASE}/modifier-group-categories/mgc_unknown`, {
      name: 'Updated',
    });

    await expect(categoryPATCH(req)).rejects.toThrow('ModifierGroupCategory mgc_unknown not found');
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Group Categories — Delete
// ═══════════════════════════════════════════════════════════════

describe('DELETE /api/v1/catalog/modifier-group-categories/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('deletes category and returns 200 on success', async () => {
    mockDeleteModifierGroupCategory.mockResolvedValue(undefined);

    const res = await categoryDELETE(makeDeleteRequest(`${BASE}/modifier-group-categories/mgc_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 409 if groups still reference the category', async () => {
    const { AppError } = await import('@oppsera/shared');
    mockDeleteModifierGroupCategory.mockRejectedValue(
      new AppError('CONFLICT', 'Category has modifier groups assigned', 409),
    );

    await expect(
      categoryDELETE(makeDeleteRequest(`${BASE}/modifier-group-categories/mgc_001`)),
    ).rejects.toThrow('Category has modifier groups assigned');
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Groups — List
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/catalog/modifier-groups', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns groups with enhanced fields (instructionMode, defaultBehavior, channelVisibility)', async () => {
    const groups = [
      {
        id: 'mg_001',
        name: 'Protein',
        instructionMode: 'required',
        defaultBehavior: 'single_select',
        channelVisibility: ['pos', 'online'],
        modifiers: [
          { id: 'mod_001', name: 'Chicken', priceCents: 200 },
        ],
      },
    ];
    mockListModifierGroups.mockResolvedValue(groups);

    const res = await groupsGET(makeGetRequest(`${BASE}/modifier-groups`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].instructionMode).toBe('required');
    expect(body.data[0].defaultBehavior).toBe('single_select');
    expect(body.data[0].channelVisibility).toEqual(['pos', 'online']);
  });

  it('passes categoryId filter to query', async () => {
    mockListModifierGroups.mockResolvedValue([]);

    await groupsGET(makeGetRequest(`${BASE}/modifier-groups?categoryId=mgc_001`));

    expect(mockListModifierGroups).toHaveBeenCalledWith(
      'tenant_001',
      expect.objectContaining({ categoryId: 'mgc_001' }),
    );
  });

  it('passes channel filter to query', async () => {
    mockListModifierGroups.mockResolvedValue([]);

    await groupsGET(makeGetRequest(`${BASE}/modifier-groups?channel=online`));

    expect(mockListModifierGroups).toHaveBeenCalledWith(
      'tenant_001',
      expect.objectContaining({ channel: 'online' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Groups — Create
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/catalog/modifier-groups', () => {
  beforeEach(() => vi.resetAllMocks());

  it('creates group with enhanced fields and returns 201', async () => {
    const created = {
      id: 'mg_new',
      name: 'Sauce Selection',
      instructionMode: 'optional',
      defaultBehavior: 'multi_select',
      channelVisibility: ['pos', 'online', 'kiosk'],
      minSelections: 0,
      maxSelections: 3,
    };
    mockCreateModifierGroup.mockResolvedValue(created);

    const req = makePostRequest(`${BASE}/modifier-groups`, {
      name: 'Sauce Selection',
      instructionMode: 'optional',
      defaultBehavior: 'multi_select',
      channelVisibility: ['pos', 'online', 'kiosk'],
      minSelections: 0,
      maxSelections: 3,
    });
    const res = await groupsPOST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('mg_new');
    expect(body.data.name).toBe('Sauce Selection');
    expect(body.data.channelVisibility).toEqual(['pos', 'online', 'kiosk']);
  });

  it('returns 400 for missing name', async () => {
    const req = makePostRequest(`${BASE}/modifier-groups`, {
      instructionMode: 'optional',
    });

    await expect(groupsPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Groups — Get Detail
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/catalog/modifier-groups/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns full detail with modifiers and assignment count', async () => {
    const detail = {
      id: 'mg_001',
      name: 'Protein',
      instructionMode: 'required',
      defaultBehavior: 'single_select',
      channelVisibility: ['pos'],
      minSelections: 1,
      maxSelections: 1,
      modifiers: [
        { id: 'mod_001', name: 'Chicken', priceCents: 200, isDefault: false },
        { id: 'mod_002', name: 'Beef', priceCents: 300, isDefault: true },
      ],
      assignmentCount: 15,
    };
    mockGetModifierGroup.mockResolvedValue(detail);

    const res = await groupDetailGET(makeGetRequest(`${BASE}/modifier-groups/mg_001`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('mg_001');
    expect(body.data.modifiers).toHaveLength(2);
    expect(body.data.assignmentCount).toBe(15);
  });

  it('returns 404 for unknown group id', async () => {
    mockGetModifierGroup.mockResolvedValue(null);

    const res = await groupDetailGET(makeGetRequest(`${BASE}/modifier-groups/mg_unknown`));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('mg_unknown');
  });
});

// ═══════════════════════════════════════════════════════════════
// Modifier Groups — Update
// ═══════════════════════════════════════════════════════════════

describe('PATCH /api/v1/catalog/modifier-groups/:id', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates group with new fields and returns 200', async () => {
    const updated = {
      id: 'mg_001',
      name: 'Protein Options',
      instructionMode: 'required',
      defaultBehavior: 'single_select',
      channelVisibility: ['pos', 'online'],
      minSelections: 1,
      maxSelections: 2,
    };
    mockUpdateModifierGroup.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/modifier-groups/mg_001`, {
      name: 'Protein Options',
      maxSelections: 2,
      channelVisibility: ['pos', 'online'],
    });
    const res = await groupPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Protein Options');
    expect(body.data.maxSelections).toBe(2);
    expect(body.data.channelVisibility).toEqual(['pos', 'online']);
  });

  it('passes groupId extracted from URL path', async () => {
    const updated = { id: 'mg_001', name: 'Updated' };
    mockUpdateModifierGroup.mockResolvedValue(updated);

    const req = makePatchRequest(`${BASE}/modifier-groups/mg_001`, { name: 'Updated' });
    await groupPATCH(req);

    expect(mockUpdateModifierGroup).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'mg_001',
      expect.objectContaining({ name: 'Updated' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Bulk Assignment
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/catalog/modifier-groups/bulk-assign', () => {
  beforeEach(() => vi.resetAllMocks());

  it('merge mode returns assignedCount and skippedCount', async () => {
    const result = { assignedCount: 8, skippedCount: 2 };
    mockBulkAssignModifierGroups.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/modifier-groups/bulk-assign`, {
      itemIds: ['item_001', 'item_002', 'item_003', 'item_004', 'item_005'],
      groupIds: ['mg_001', 'mg_002'],
      mode: 'merge',
    });
    const res = await bulkAssignPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.assignedCount).toBe(8);
    expect(body.data.skippedCount).toBe(2);
  });

  it('replace mode works', async () => {
    const result = { assignedCount: 10, skippedCount: 0 };
    mockBulkAssignModifierGroups.mockResolvedValue(result);

    const req = makePostRequest(`${BASE}/modifier-groups/bulk-assign`, {
      itemIds: ['item_001', 'item_002', 'item_003', 'item_004', 'item_005'],
      groupIds: ['mg_001', 'mg_002'],
      mode: 'replace',
    });
    const res = await bulkAssignPOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.assignedCount).toBe(10);
    expect(body.data.skippedCount).toBe(0);
  });

  it('returns 400 for empty itemIds', async () => {
    const req = makePostRequest(`${BASE}/modifier-groups/bulk-assign`, {
      itemIds: [],
      groupIds: ['mg_001'],
      mode: 'merge',
    });

    await expect(bulkAssignPOST(req)).rejects.toThrow();
  });

  it('returns 400 for too many items (>500)', async () => {
    const tooManyItems = Array.from({ length: 501 }, (_, i) => `item_${String(i).padStart(4, '0')}`);
    const req = makePostRequest(`${BASE}/modifier-groups/bulk-assign`, {
      itemIds: tooManyItems,
      groupIds: ['mg_001'],
      mode: 'merge',
    });

    await expect(bulkAssignPOST(req)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════
// Item Modifier Assignments — Get
// ═══════════════════════════════════════════════════════════════

describe('GET /api/v1/catalog/items/:id/modifier-assignments', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns assignments with overrides', async () => {
    const assignments = [
      {
        groupId: 'mg_001',
        groupName: 'Protein',
        isDefault: true,
        overrides: { minSelections: 1, maxSelections: 2 },
        modifiers: [
          { id: 'mod_001', name: 'Chicken', priceCents: 200 },
          { id: 'mod_002', name: 'Beef', priceCents: 300 },
        ],
      },
      {
        groupId: 'mg_002',
        groupName: 'Sauce',
        isDefault: false,
        overrides: null,
        modifiers: [
          { id: 'mod_003', name: 'Ranch', priceCents: 0 },
        ],
      },
    ];
    mockGetItemModifierAssignments.mockResolvedValue(assignments);

    const res = await itemAssignmentsGET(
      makeGetRequest(`${BASE}/items/item_001/modifier-assignments`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].groupId).toBe('mg_001');
    expect(body.data[0].overrides).toEqual({ minSelections: 1, maxSelections: 2 });
    expect(body.data[1].overrides).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Item Modifier Assignments — Update Overrides
// ═══════════════════════════════════════════════════════════════

describe('PATCH /api/v1/catalog/items/:id/modifier-assignments/:groupId', () => {
  beforeEach(() => vi.resetAllMocks());

  it('updates overrides and returns 200', async () => {
    const updated = {
      itemId: 'item_001',
      groupId: 'mg_001',
      overrides: { minSelections: 0, maxSelections: 5 },
    };
    mockUpdateItemModifierAssignment.mockResolvedValue(updated);

    const req = makePatchRequest(
      `${BASE}/items/item_001/modifier-assignments/mg_001`,
      { overrides: { minSelections: 0, maxSelections: 5 } },
    );
    const res = await itemAssignmentPATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.overrides.maxSelections).toBe(5);
  });

  it('passes itemId and groupId extracted from URL path', async () => {
    const updated = { itemId: 'item_001', groupId: 'mg_001', overrides: {} };
    mockUpdateItemModifierAssignment.mockResolvedValue(updated);

    const req = makePatchRequest(
      `${BASE}/items/item_001/modifier-assignments/mg_001`,
      { overrides: {} },
    );
    await itemAssignmentPATCH(req);

    expect(mockUpdateItemModifierAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'item_001',
      'mg_001',
      expect.any(Object),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Item Modifier Assignments — Remove
// ═══════════════════════════════════════════════════════════════

describe('DELETE /api/v1/catalog/items/:id/modifier-assignments/:groupId', () => {
  beforeEach(() => vi.resetAllMocks());

  it('removes assignment and returns 200', async () => {
    mockRemoveItemModifierAssignment.mockResolvedValue(undefined);

    const res = await itemAssignmentDELETE(
      makeDeleteRequest(`${BASE}/items/item_001/modifier-assignments/mg_001`),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
  });

  it('passes itemId and groupId from URL to command', async () => {
    mockRemoveItemModifierAssignment.mockResolvedValue(undefined);

    await itemAssignmentDELETE(
      makeDeleteRequest(`${BASE}/items/item_002/modifier-assignments/mg_003`),
    );

    expect(mockRemoveItemModifierAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_001' }),
      'item_002',
      'mg_003',
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Route exports verification
// ═══════════════════════════════════════════════════════════════

describe('Modifier API route exports', () => {
  it('exports GET and POST for /modifier-group-categories', () => {
    expect(typeof categoriesGET).toBe('function');
    expect(typeof categoriesPOST).toBe('function');
  });

  it('exports PATCH and DELETE for /modifier-group-categories/:id', () => {
    expect(typeof categoryPATCH).toBe('function');
    expect(typeof categoryDELETE).toBe('function');
  });

  it('exports GET and POST for /modifier-groups', () => {
    expect(typeof groupsGET).toBe('function');
    expect(typeof groupsPOST).toBe('function');
  });

  it('exports GET and PATCH for /modifier-groups/:id', () => {
    expect(typeof groupDetailGET).toBe('function');
    expect(typeof groupPATCH).toBe('function');
  });

  it('exports POST for /modifier-groups/bulk-assign', () => {
    expect(typeof bulkAssignPOST).toBe('function');
  });

  it('exports GET for /items/:id/modifier-assignments', () => {
    expect(typeof itemAssignmentsGET).toBe('function');
  });

  it('exports PATCH and DELETE for /items/:id/modifier-assignments/:groupId', () => {
    expect(typeof itemAssignmentPATCH).toBe('function');
    expect(typeof itemAssignmentDELETE).toBe('function');
  });
});
