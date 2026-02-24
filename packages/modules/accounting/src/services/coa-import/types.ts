/**
 * Types for the Intelligent COA Import System.
 *
 * This module handles multi-format file parsing, intelligent column detection,
 * account type inference, hierarchy detection, and confidence scoring.
 */

// ── File Parsing ────────────────────────────────────────────────────

export type FileFormat = 'csv' | 'tsv' | 'xlsx';

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  totalRows: number;
  format: FileFormat;
  /** First 10 rows for sampling */
  sampleRows: string[][];
}

// ── Column Detection ────────────────────────────────────────────────

export type TargetField =
  | 'accountNumber'
  | 'name'
  | 'accountType'
  | 'detailType'
  | 'parentAccountNumber'
  | 'classificationName'
  | 'description'
  | 'isActive'
  | 'isSubAccount'
  | 'ignore';

export interface ColumnMapping {
  /** Original header text from the file */
  sourceColumn: string;
  /** Column index in the file */
  sourceIndex: number;
  /** Mapped OppsEra field */
  targetField: TargetField;
  /** Confidence 0-100 */
  confidence: number;
  /** Human-readable explanation of why this mapping was chosen */
  reason: string;
  /** First few distinct values from this column */
  sampleValues: string[];
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 90) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

// ── Type Inference ──────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface TypeInference {
  accountType: AccountType;
  confidence: number;
  reason: string;
  /** Which signal(s) contributed to this inference */
  signals: TypeSignal[];
}

export interface TypeSignal {
  source: 'explicit_column' | 'code_range' | 'name_keyword' | 'detail_type' | 'parent_type';
  value: string;
  suggestedType: AccountType;
  weight: number;
}

// ── Hierarchy Detection ─────────────────────────────────────────────

export type HierarchyStrategy =
  | 'parent_column'
  | 'code_prefix'
  | 'indentation'
  | 'none';

export interface HierarchyDetectionResult {
  strategy: HierarchyStrategy;
  confidence: number;
  reason: string;
  /** For code_prefix: the detected separator (e.g., '-', '.') */
  codeSeparator?: string;
  /** For code_prefix: number of prefix digits that define parent grouping */
  prefixLength?: number;
  /** Detected parent relationships: childNumber → parentNumber */
  relationships: Map<string, string>;
}

// ── Account Preview ─────────────────────────────────────────────────

export interface AccountPreview {
  rowNumber: number;
  rawValues: Record<string, string>;
  /** Final resolved values */
  accountNumber: string;
  name: string;
  accountType: AccountType;
  typeConfidence: number;
  typeReason: string;
  normalBalance: NormalBalance;
  parentAccountNumber: string | null;
  classificationName: string | null;
  description: string | null;
  isActive: boolean;
  /** Whether this is a posting (detail) account or a header (summary) account */
  isPosting: boolean;
  /** Validation issues for this row */
  issues: PreviewIssue[];
}

// ── Validation ──────────────────────────────────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'DUPLICATE_CODE'
  | 'DUPLICATE_NAME'
  | 'MISSING_CODE'
  | 'MISSING_NAME'
  | 'INVALID_TYPE'
  | 'MISSING_TYPE'
  | 'PARENT_NOT_FOUND'
  | 'CIRCULAR_PARENT'
  | 'CODE_FORMAT'
  | 'LEADING_ZERO_LOSS'
  | 'POSTING_WITH_CHILDREN'
  | 'HEADER_WITHOUT_CHILDREN'
  | 'TYPE_MISMATCH_PARENT'
  | 'DEPTH_EXCEEDED'
  | 'EXISTING_ACCOUNT'
  | 'LOW_TYPE_CONFIDENCE';

export interface PreviewIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  /** Suggested fix(es) */
  resolutions?: IssueResolution[];
}

export interface IssueResolution {
  action: 'skip' | 'merge' | 'rename' | 'retype' | 'reparent' | 'auto_fix' | 'create_header';
  label: string;
  description: string;
  /** Data needed to apply this resolution */
  data?: Record<string, unknown>;
}

// ── Validation Summary ──────────────────────────────────────────────

export interface ValidationSummary {
  isValid: boolean;
  totalRows: number;
  validRows: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: Array<PreviewIssue & { rowNumber?: number; accountNumber?: string }>;
  /** Existing accounts that would be skipped */
  existingAccountNumbers: string[];
  /** Type distribution of valid accounts */
  typeDistribution: Record<AccountType, number>;
}

// ── Analysis Result (JSON-serializable) ─────────────────────────────

/** Serialized hierarchy result — parentMap is a plain object (not Map) */
export interface HierarchyResultSerialized {
  strategy: HierarchyStrategy;
  confidence: number;
  reason: string;
  codeSeparator?: string;
  prefixLength?: number;
  /** Child account number → parent account number (plain object for JSON serialization) */
  parentMap: Record<string, string>;
}

export interface AnalysisResult {
  /** File metadata */
  fileInfo: {
    fileName: string;
    format: FileFormat;
    totalRows: number;
    headers: string[];
  };

  /** Detected column mappings with confidence */
  columnMappings: ColumnMapping[];

  /** Detected hierarchy strategy (serialized — uses parentMap object, not Map) */
  hierarchy: HierarchyResultSerialized;

  /** Preview of all accounts with inferred types */
  accounts: AccountPreview[];

  /** Validation summary */
  validation: ValidationSummary;

  /** Overall analysis confidence (0-100) */
  overallConfidence: number;
}

// ── Import Options ──────────────────────────────────────────────────

export interface ImportOptions {
  /** User-adjusted column mappings (overrides auto-detected) */
  columnMappings?: ColumnMapping[];
  /** User-selected hierarchy strategy */
  hierarchyStrategy?: HierarchyStrategy;
  /** State name for placeholder replacement */
  stateName?: string;
  /** Import mode */
  mergeMode?: 'fresh' | 'merge';
  /** Per-row overrides from the user (rowNumber → overrides) */
  rowOverrides?: Record<number, Partial<AccountPreview>>;
  /** Row numbers to skip */
  skipRows?: number[];
  /** Original file name for import log */
  fileName?: string;
  /** Custom column→field mappings as key-value */
  customMappings?: Record<string, string>;
}

// ── Import Result ───────────────────────────────────────────────────

export interface ImportExecutionResult {
  importLogId: string;
  totalRows: number;
  accountsCreated: number;
  accountsSkipped: number;
  headersCreated: number;
  errorsCount: number;
  errors: Array<{ row: number; accountNumber?: string; message: string }>;
  warnings: string[];
  /** Accounts that were created (for post-import verification) */
  createdAccounts: Array<{ accountNumber: string; name: string; accountType: AccountType }>;
}
