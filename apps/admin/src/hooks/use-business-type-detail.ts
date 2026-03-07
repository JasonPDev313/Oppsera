'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/lib/api-fetch';

export interface BusinessTypeVersion {
  id: string;
  businessTypeId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessTypeDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  iconKey: string | null;
  isActive: boolean;
  isSystem: boolean;
  showAtSignup: boolean;
  sortOrder: number;
  publishedVersion: BusinessTypeVersion | null;
  draftVersion: BusinessTypeVersion | null;
  versions: BusinessTypeVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ModuleRegistryEntry {
  key: string;
  label: string;
  description: string;
  category: string;
  dependencies: string[];
  incompatibleWith: string[];
  accessModes: string[];
}

export interface ModuleDefault {
  id: string;
  businessTypeVersionId: string;
  moduleKey: string;
  isEnabled: boolean;
  accessMode: string;
  configJson: unknown;
}

export function useBusinessTypeDetail(id: string) {
  const [detail, setDetail] = useState<BusinessTypeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: BusinessTypeDetail }>(
        `/api/v1/admin/business-types/${id}`,
      );
      setDetail(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const updateMetadata = useCallback(
    async (data: Record<string, unknown>) => {
      const res = await adminFetch<{ data: BusinessTypeDetail }>(
        `/api/v1/admin/business-types/${id}`,
        { method: 'PATCH', body: JSON.stringify(data) },
      );
      setDetail((prev) => (prev ? { ...prev, ...res.data } : prev));
      return res.data;
    },
    [id],
  );

  const createDraft = useCallback(async () => {
    const res = await adminFetch<{ data: BusinessTypeVersion }>(
      `/api/v1/admin/business-types/${id}/versions/draft`,
      { method: 'POST' },
    );
    await load();
    return res.data;
  }, [id, load]);

  const activate = useCallback(async () => {
    await adminFetch(`/api/v1/admin/business-types/${id}/activate`, { method: 'PATCH' });
    await load();
  }, [id, load]);

  const deactivate = useCallback(async () => {
    await adminFetch(`/api/v1/admin/business-types/${id}/deactivate`, { method: 'PATCH' });
    await load();
  }, [id, load]);

  return { detail, isLoading, error, load, updateMetadata, createDraft, activate, deactivate };
}

export function useModuleDefaults(versionId: string | undefined) {
  const [defaults, setDefaults] = useState<ModuleDefault[]>([]);
  const [registry, setRegistry] = useState<ModuleRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!versionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{
        data: { defaults: ModuleDefault[]; registry: ModuleRegistryEntry[] };
      }>(`/api/v1/admin/business-types/versions/${versionId}/modules`);
      setDefaults(res.data.defaults);
      setRegistry(res.data.registry);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load modules');
    } finally {
      setIsLoading(false);
    }
  }, [versionId]);

  const save = useCallback(
    async (modules: { moduleKey: string; isEnabled: boolean; accessMode: string }[]) => {
      if (!versionId) return;
      setIsSaving(true);
      try {
        await adminFetch(`/api/v1/admin/business-types/versions/${versionId}/modules`, {
          method: 'PUT',
          body: JSON.stringify({ modules }),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [versionId],
  );

  return { defaults, registry, isLoading, isSaving, error, load, save };
}

// ── Accounting Template ───────────────────────────────────────────

export interface AccountingTemplateRow {
  id: string;
  businessTypeVersionId: string;
  coaTemplateRef: string | null;
  revenueCategories: Record<string, string>;
  paymentGlMappings: Record<string, string>;
  taxBehavior: { defaultTaxInclusive?: boolean; separateTaxLiability?: boolean };
  deferredRevenue: { enabled?: boolean; liabilityAccount?: string };
  cogsBehavior: string;
  fiscalSettings: { fiscalYearStart?: string; reportingCurrency?: string };
  workflowDefaults: Record<string, { autoMode: boolean; approvalRequired: boolean; userVisible: boolean }>;
  validationStatus: string;
  validationErrors: string[];
}

export function useAccountingTemplate(versionId: string | undefined) {
  const [template, setTemplate] = useState<AccountingTemplateRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!versionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: AccountingTemplateRow | null }>(
        `/api/v1/admin/business-types/versions/${versionId}/accounting`,
      );
      setTemplate(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [versionId]);

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      if (!versionId) return;
      setIsSaving(true);
      setError(null);
      try {
        const res = await adminFetch<{ data: AccountingTemplateRow }>(
          `/api/v1/admin/business-types/versions/${versionId}/accounting`,
          { method: 'PUT', body: JSON.stringify(data) },
        );
        setTemplate(res.data);
        return res.data;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [versionId],
  );

  return { template, isLoading, isSaving, error, load, save };
}

// ── Role Templates ────────────────────────────────────────────────

export interface RoleTemplateWithPermissions {
  id: string;
  businessTypeVersionId: string;
  roleName: string;
  roleKey: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  permissions: string[];
}

export interface PermissionGroup {
  moduleKey: string;
  moduleLabel: string;
  permissions: string[];
}

export function useRoleTemplates(versionId: string | undefined) {
  const [roles, setRoles] = useState<RoleTemplateWithPermissions[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!versionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        adminFetch<{ data: RoleTemplateWithPermissions[] }>(
          `/api/v1/admin/business-types/versions/${versionId}/roles`,
        ),
        adminFetch<{ data: PermissionGroup[] }>(
          `/api/v1/admin/business-types/versions/${versionId}/roles/permissions/available`,
        ),
      ]);
      setRoles(rolesRes.data);
      setAvailablePermissions(permsRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [versionId]);

  const addRole = useCallback(
    async (input: {
      roleName: string;
      roleKey: string;
      description?: string;
      permissions: string[];
    }) => {
      if (!versionId) return;
      setIsSaving(true);
      try {
        await adminFetch(`/api/v1/admin/business-types/versions/${versionId}/roles`, {
          method: 'POST',
          body: JSON.stringify(input),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add role');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [versionId, load],
  );

  const updateRole = useCallback(
    async (
      roleId: string,
      input: {
        roleName: string;
        roleKey: string;
        description?: string | null;
        permissions: string[];
        isActive?: boolean;
      },
    ) => {
      if (!versionId) return;
      setIsSaving(true);
      try {
        await adminFetch(
          `/api/v1/admin/business-types/versions/${versionId}/roles/${roleId}`,
          { method: 'PUT', body: JSON.stringify(input) },
        );
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update role');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [versionId, load],
  );

  const deleteRole = useCallback(
    async (roleId: string) => {
      if (!versionId) return;
      setIsSaving(true);
      try {
        await adminFetch(
          `/api/v1/admin/business-types/versions/${versionId}/roles/${roleId}`,
          { method: 'DELETE' },
        );
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete role');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [versionId, load],
  );

  return { roles, availablePermissions, isLoading, isSaving, error, load, addRole, updateRole, deleteRole };
}
