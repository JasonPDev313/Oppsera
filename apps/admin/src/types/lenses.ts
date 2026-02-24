export interface LensFilter {
  dimensionSlug: string;
  operator: 'eq' | 'in' | 'gte' | 'lte' | 'between';
  value: unknown;
}

export interface SystemLens {
  id: string;
  tenantId: null;
  slug: string;
  displayName: string;
  description: string | null;
  domain: string;
  allowedMetrics: string[] | null;
  allowedDimensions: string[] | null;
  defaultMetrics: string[] | null;
  defaultDimensions: string[] | null;
  defaultFilters: LensFilter[] | null;
  systemPromptFragment: string | null;
  exampleQuestions: string[] | null;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSystemLensPayload {
  slug: string;
  displayName: string;
  description?: string;
  domain: string;
  allowedMetrics?: string[];
  allowedDimensions?: string[];
  defaultMetrics?: string[];
  defaultDimensions?: string[];
  defaultFilters?: LensFilter[];
  systemPromptFragment?: string;
  exampleQuestions?: string[];
}

export interface UpdateSystemLensPayload {
  displayName?: string;
  description?: string;
  domain?: string;
  allowedMetrics?: string[];
  allowedDimensions?: string[];
  defaultMetrics?: string[];
  defaultDimensions?: string[];
  defaultFilters?: LensFilter[];
  systemPromptFragment?: string;
  exampleQuestions?: string[];
}
