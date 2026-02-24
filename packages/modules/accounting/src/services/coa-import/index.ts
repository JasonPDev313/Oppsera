/**
 * Intelligent COA Import System — public API.
 */

// Analysis engine (main entry point)
export { analyzeFile, reanalyzeWithOverrides } from './analysis-engine';

// Import processor
export { executeImport } from './import-processor';

// Sub-modules (for advanced usage)
export { parseFile, detectFormat } from './file-parser';
export { detectColumns } from './column-detector';
export { inferAccountType, resolveNormalBalance } from './type-inferrer';
export { detectHierarchy } from './hierarchy-detector';
export { validateAccounts } from './validation-engine';

// Types
export type {
  FileFormat,
  ParsedFile,
  TargetField,
  ColumnMapping,
  ConfidenceLevel,
  AccountType,
  NormalBalance,
  TypeInference,
  TypeSignal,
  HierarchyStrategy,
  HierarchyDetectionResult,
  HierarchyResultSerialized,
  AccountPreview,
  IssueSeverity,
  IssueCode,
  PreviewIssue,
  IssueResolution,
  ValidationSummary,
  AnalysisResult,
  ImportOptions,
  ImportExecutionResult,
} from './types';

export { getConfidenceLevel } from './types';
