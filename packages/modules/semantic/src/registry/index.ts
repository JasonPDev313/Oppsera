// ── Registry barrel ──────────────────────────────────────────────

export type {
  MetricDef,
  DimensionDef,
  MetricDimensionRelation,
  LensDef,
  RegistryCatalog,
  Domain,
  SqlAggregation,
  DataType,
  SqlDataType,
  DimensionCategory,
} from './types';

export {
  UnknownMetricError,
  UnknownDimensionError,
  IncompatibleMetricError,
  InvalidDimensionForMetricError,
} from './types';

export {
  getMetric,
  getDimension,
  listMetrics,
  listDimensions,
  listLenses,
  getLens,
  getValidDimensionsForMetric,
  getDefaultDimensionsForMetric,
  validatePlan,
  buildRegistryCatalog,
  invalidateRegistryCache,
  setRegistryCache,
} from './registry';

export type { ValidationOptions, ValidationResult, RegistryCache } from './registry';

export { syncRegistryToDb } from './sync';

export {
  CORE_METRICS,
  CORE_DIMENSIONS,
  GOLF_METRICS,
  GOLF_DIMENSIONS,
  CORE_METRIC_DIMENSIONS,
  GOLF_METRIC_DIMENSIONS,
  SYSTEM_LENSES,
} from './seed-data';
