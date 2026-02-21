// ── Registry domain types ─────────────────────────────────────────

export type Domain = 'core' | 'golf' | 'inventory' | 'customer' | string;
export type SqlAggregation = 'sum' | 'count' | 'avg' | 'max' | 'min' | 'custom';
export type DataType = 'number' | 'currency' | 'percent' | 'integer' | 'duration';
export type SqlDataType = 'text' | 'date' | 'timestamptz' | 'integer' | 'uuid' | 'numeric';
export type DimensionCategory = 'time' | 'geography' | 'product' | 'customer' | 'operation' | 'golf' | string;

export interface MetricDef {
  slug: string;
  displayName: string;
  description?: string | null;
  domain: Domain;
  category?: string | null;
  tags?: string[] | null;
  sqlExpression: string;
  sqlTable: string;
  sqlAggregation: SqlAggregation;
  sqlFilter?: string | null;
  dataType: DataType;
  formatPattern?: string | null;
  unit?: string | null;
  higherIsBetter?: boolean | null;
  aliases?: string[] | null;
  examplePhrases?: string[] | null;
  relatedMetrics?: string[] | null;
  requiresDimensions?: string[] | null;
  incompatibleWith?: string[] | null;
  isActive: boolean;
  isExperimental: boolean;
}

export interface DimensionDef {
  slug: string;
  displayName: string;
  description?: string | null;
  domain: Domain;
  category?: DimensionCategory | null;
  tags?: string[] | null;
  sqlExpression: string;
  sqlTable: string;
  sqlDataType: SqlDataType;
  sqlCast?: string | null;
  hierarchyParent?: string | null;
  hierarchyLevel?: number | null;
  isTimeDimension: boolean;
  timeGranularities?: string[] | null;
  lookupTable?: string | null;
  lookupKeyColumn?: string | null;
  lookupLabelColumn?: string | null;
  aliases?: string[] | null;
  exampleValues?: string[] | null;
  examplePhrases?: string[] | null;
  isActive: boolean;
}

export interface MetricDimensionRelation {
  metricSlug: string;
  dimensionSlug: string;
  isRequired: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface LensDef {
  slug: string;
  tenantId?: string | null;
  displayName: string;
  description?: string | null;
  domain: Domain;
  allowedMetrics?: string[] | null;
  allowedDimensions?: string[] | null;
  defaultMetrics?: string[] | null;
  defaultDimensions?: string[] | null;
  defaultFilters?: unknown[] | null;
  systemPromptFragment?: string | null;
  exampleQuestions?: string[] | null;
  isActive: boolean;
  isSystem: boolean;
}

// ── Registry catalog (for LLM prompt injection) ───────────────────

export interface RegistryCatalog {
  metrics: MetricDef[];
  dimensions: DimensionDef[];
  lenses: LensDef[];
  generatedAt: string;
}

// ── Validation errors ──────────────────────────────────────────────

export class UnknownMetricError extends Error {
  constructor(public slug: string) {
    super(`Unknown metric: ${slug}`);
    this.name = 'UnknownMetricError';
  }
}

export class UnknownDimensionError extends Error {
  constructor(public slug: string) {
    super(`Unknown dimension: ${slug}`);
    this.name = 'UnknownDimensionError';
  }
}

export class IncompatibleMetricError extends Error {
  constructor(
    public metricSlug: string,
    public conflictSlug: string,
  ) {
    super(`Metrics "${metricSlug}" and "${conflictSlug}" are incompatible`);
    this.name = 'IncompatibleMetricError';
  }
}

export class InvalidDimensionForMetricError extends Error {
  constructor(
    public metricSlug: string,
    public dimensionSlug: string,
  ) {
    super(`Dimension "${dimensionSlug}" is not valid for metric "${metricSlug}"`);
    this.name = 'InvalidDimensionForMetricError';
  }
}
