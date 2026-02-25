/**
 * Types for the intelligent customer CSV import pipeline.
 */

// ── Target Field Metadata ───────────────────────────────────────────

export interface TargetField {
  key: string;
  label: string;
  table: 'customers' | 'addresses' | 'phones' | 'emails' | 'identifiers' | 'external_ids' | 'billing_accounts';
  group: 'identity' | 'contact' | 'address' | 'demographics' | 'golf' | 'financial' | 'marketing' | 'membership' | 'status' | 'meta';
  required: boolean;
  dataType: 'string' | 'boolean' | 'number' | 'date' | 'enum';
  enumValues?: string[];
}

// ── Column Mapping ──────────────────────────────────────────────────

export interface ColumnMapping {
  sourceHeader: string;
  sourceIndex: number;
  targetField: string | null;
  confidence: number;          // 0-100
  method: 'alias' | 'ai' | 'manual' | 'unmapped';
  reasoning?: string;
}

// ── Transforms ──────────────────────────────────────────────────────

export type TransformType = 'split_name' | 'split_address' | 'none';

export interface DetectedTransform {
  sourceIndex: number;
  sourceHeader: string;
  type: TransformType;
  description: string;
  outputFields: string[];  // target field keys produced by this transform
}

// ── AI Mapping ──────────────────────────────────────────────────────

export interface AiMappingSuggestion {
  sourceHeader: string;
  suggestedField: string | null;
  confidence: number;
  reasoning: string;
}

// ── Validation ──────────────────────────────────────────────────────

export interface ValidationMessage {
  row?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface MappedCustomerRow {
  rowIndex: number;
  customer: Record<string, unknown>;
  address?: Record<string, unknown>;
  phone?: Record<string, unknown>;
  email?: Record<string, unknown>;
  identifier?: Record<string, unknown>;
  externalId?: string;
  billingBalance?: number;
  creditLimit?: number;
}

// ── Duplicate Detection ─────────────────────────────────────────────

export interface DuplicateMatch {
  csvRowIndex: number;
  matchType: 'email' | 'phone' | 'member_number' | 'external_id';
  existingCustomerId: string;
  existingDisplayName: string;
  existingEmail: string | null;
  matchConfidence: number;
}

export type DuplicateResolution = 'skip' | 'update' | 'create_new';

// ── Detection Result ────────────────────────────────────────────────

export interface DetectColumnsResult {
  headers: string[];
  sampleRows: string[][];
  mappings: ColumnMapping[];
  transforms: DetectedTransform[];
  totalRows: number;
}

// ── Validation Result ───────────────────────────────────────────────

export interface ImportValidationResult {
  isValid: boolean;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  totalRows: number;
  validRows: number;
  duplicates: DuplicateMatch[];
  preview: MappedCustomerRow[];
}

// ── Import Result ───────────────────────────────────────────────────

export interface ImportResult {
  importLogId: string;
  totalRows: number;
  successRows: number;
  updatedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: Array<{ row: number; message: string }>;
  createdCustomerIds?: string[];
}
