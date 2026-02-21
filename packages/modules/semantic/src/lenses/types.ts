// ── Custom Lens Types ─────────────────────────────────────────────
// Custom lenses are tenant-created lens definitions layered on top of
// the system lenses. They narrow the available metrics/dimensions for
// specific use cases and inject custom prompt fragments.

export interface CreateLensInput {
  tenantId: string;
  slug: string;            // must be unique within tenant
  displayName: string;
  description?: string;
  domain: string;
  allowedMetrics?: string[];   // null = inherit all from domain
  allowedDimensions?: string[];
  defaultMetrics?: string[];
  defaultDimensions?: string[];
  defaultFilters?: LensFilterInput[];
  systemPromptFragment?: string;
  exampleQuestions?: string[];
}

export interface UpdateLensInput {
  tenantId: string;
  slug: string;
  displayName?: string;
  description?: string;
  allowedMetrics?: string[];
  allowedDimensions?: string[];
  defaultMetrics?: string[];
  defaultDimensions?: string[];
  defaultFilters?: LensFilterInput[];
  systemPromptFragment?: string;
  exampleQuestions?: string[];
}

export interface LensFilterInput {
  dimensionSlug: string;
  operator: 'eq' | 'in' | 'gte' | 'lte' | 'between';
  value: unknown;
}

export interface CustomLensRow {
  id: string;
  tenantId: string;
  slug: string;
  displayName: string;
  description: string | null;
  domain: string;
  allowedMetrics: string[] | null;
  allowedDimensions: string[] | null;
  defaultMetrics: string[] | null;
  defaultDimensions: string[] | null;
  defaultFilters: LensFilterInput[] | null;
  systemPromptFragment: string | null;
  exampleQuestions: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListCustomLensesInput {
  tenantId: string;
  domain?: string;
  includeInactive?: boolean;
}

// ── Validation errors ─────────────────────────────────────────────

export class DuplicateLensSlugError extends Error {
  constructor(public slug: string, public tenantId: string) {
    super(`Lens slug "${slug}" already exists for tenant ${tenantId}`);
    this.name = 'DuplicateLensSlugError';
  }
}

export class SystemLensModificationError extends Error {
  constructor(public slug: string) {
    super(`Cannot modify system lens "${slug}" — system lenses are read-only`);
    this.name = 'SystemLensModificationError';
  }
}

export class LensNotFoundError extends Error {
  constructor(public slug: string) {
    super(`Lens not found: ${slug}`);
    this.name = 'LensNotFoundError';
  }
}

export class InvalidLensSlugError extends Error {
  constructor(public slug: string) {
    super(`Invalid lens slug "${slug}" — use lowercase letters, numbers, and underscores only`);
    this.name = 'InvalidLensSlugError';
  }
}
