/**
 * Analysis engine — orchestrates the intelligent COA import pipeline.
 *
 * Flow:
 *   1. Parse file (CSV/TSV)
 *   2. Detect columns with confidence scoring
 *   3. Infer account types with confidence
 *   4. Detect hierarchy structure
 *   5. Generate account previews
 *   6. Validate all accounts
 *   7. Return comprehensive AnalysisResult
 */

import { parseFile, detectFormat } from './file-parser';
import { detectColumns } from './column-detector';
import { inferAccountType, resolveNormalBalance } from './type-inferrer';
import { detectHierarchy } from './hierarchy-detector';
import { validateAccounts } from './validation-engine';
import type {
  AccountPreview,
  AccountType,
  AnalysisResult,
  ColumnMapping,
  FileFormat,
  HierarchyDetectionResult,
  ImportOptions,
} from './types';

// ── Public API ──────────────────────────────────────────────────────

/**
 * Run full intelligent analysis on an uploaded file.
 */
export function analyzeFile(
  content: string,
  fileName: string,
  existingAccountNumbers: Set<string>,
  options?: ImportOptions,
): AnalysisResult {
  // 1. Parse file
  const format: FileFormat = options?.columnMappings ? 'csv' : detectFormat(content, fileName);
  const parsed = parseFile(content, format, fileName);

  // 2. Detect or use custom column mappings
  let columnMappings = options?.columnMappings ??
    detectColumns(parsed.headers, parsed.sampleRows, parsed.rows);

  // Apply simple key→field overrides from customMappings (Record<string, string>)
  if (options?.customMappings && !options?.columnMappings) {
    columnMappings = columnMappings.map((m) => {
      const override = options.customMappings![m.sourceColumn];
      if (override) {
        return { ...m, targetField: override as ColumnMapping['targetField'], confidence: 100, reason: 'User override' };
      }
      return m;
    });
  }

  // 3. Extract values using mappings
  const accountNumberIdx = columnMappings.find((m) => m.targetField === 'accountNumber')?.sourceIndex;
  const nameIdx = columnMappings.find((m) => m.targetField === 'name')?.sourceIndex;
  const typeIdx = columnMappings.find((m) => m.targetField === 'accountType')?.sourceIndex;
  const detailTypeIdx = columnMappings.find((m) => m.targetField === 'detailType')?.sourceIndex;
  const parentIdx = columnMappings.find((m) => m.targetField === 'parentAccountNumber')?.sourceIndex;
  const classIdx = columnMappings.find((m) => m.targetField === 'classificationName')?.sourceIndex;
  const descIdx = columnMappings.find((m) => m.targetField === 'description')?.sourceIndex;
  const activeIdx = columnMappings.find((m) => m.targetField === 'isActive')?.sourceIndex;

  // 4. First pass: infer types for all rows (needed for hierarchy detection)
  const inferredTypes = new Map<number, AccountType>();
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!;
    const code = accountNumberIdx !== undefined ? (row[accountNumberIdx] ?? '').trim() : '';
    const name = nameIdx !== undefined ? (row[nameIdx] ?? '').trim() : '';
    const rawType = typeIdx !== undefined ? (row[typeIdx] ?? '').trim() : '';
    const rawDetailType = detailTypeIdx !== undefined ? (row[detailTypeIdx] ?? '').trim() : '';

    const inference = inferAccountType(code, name, rawType || undefined, rawDetailType || undefined);
    inferredTypes.set(i, inference.accountType);
  }

  // 5. Detect hierarchy
  const hierarchy: HierarchyDetectionResult = options?.hierarchyStrategy
    ? { strategy: options.hierarchyStrategy, confidence: 100, reason: 'User-selected strategy', relationships: new Map() }
    : detectHierarchy(parsed.rows, columnMappings, inferredTypes);

  // 6. Build account previews
  const accounts = buildAccountPreviews(
    parsed.rows,
    columnMappings,
    hierarchy,
    inferredTypes,
    options,
  );

  // 7. Validate
  const validation = validateAccounts(accounts, existingAccountNumbers);

  // 8. Calculate overall confidence
  const mappingConfidence = columnMappings.length > 0
    ? columnMappings.reduce((sum, m) => sum + m.confidence, 0) / columnMappings.length
    : 0;
  const typeConfidence = accounts.length > 0
    ? accounts.reduce((sum, a) => sum + a.typeConfidence, 0) / accounts.length
    : 0;
  const hierarchyConfidence = hierarchy.confidence;

  const overallConfidence = Math.round(
    (mappingConfidence * 0.4 + typeConfidence * 0.35 + hierarchyConfidence * 0.25),
  );

  // Convert hierarchy.relationships Map to plain object for JSON serialization
  const parentMap: Record<string, string> = {};
  for (const [child, parent] of hierarchy.relationships) {
    parentMap[child] = parent;
  }

  return {
    fileInfo: {
      fileName,
      format,
      totalRows: parsed.totalRows,
      headers: parsed.headers,
    },
    columnMappings,
    hierarchy: {
      strategy: hierarchy.strategy,
      confidence: hierarchy.confidence,
      reason: hierarchy.reason,
      codeSeparator: hierarchy.codeSeparator,
      prefixLength: hierarchy.prefixLength,
      parentMap,
    },
    accounts,
    validation,
    overallConfidence,
  };
}

/**
 * Re-analyze with user-adjusted mappings and overrides.
 */
export function reanalyzeWithOverrides(
  content: string,
  fileName: string,
  existingAccountNumbers: Set<string>,
  options: ImportOptions,
): AnalysisResult {
  return analyzeFile(content, fileName, existingAccountNumbers, options);
}

// ── Account Preview Builder ─────────────────────────────────────────

function buildAccountPreviews(
  rows: string[][],
  columnMappings: ColumnMapping[],
  hierarchy: HierarchyDetectionResult,
  inferredTypes: Map<number, AccountType>,
  options?: ImportOptions,
): AccountPreview[] {
  const accountNumberIdx = columnMappings.find((m) => m.targetField === 'accountNumber')?.sourceIndex;
  const nameIdx = columnMappings.find((m) => m.targetField === 'name')?.sourceIndex;
  const typeIdx = columnMappings.find((m) => m.targetField === 'accountType')?.sourceIndex;
  const detailTypeIdx = columnMappings.find((m) => m.targetField === 'detailType')?.sourceIndex;
  const parentIdx = columnMappings.find((m) => m.targetField === 'parentAccountNumber')?.sourceIndex;
  const classIdx = columnMappings.find((m) => m.targetField === 'classificationName')?.sourceIndex;
  const descIdx = columnMappings.find((m) => m.targetField === 'description')?.sourceIndex;
  const activeIdx = columnMappings.find((m) => m.targetField === 'isActive')?.sourceIndex;

  const skipRows = new Set(options?.skipRows ?? []);
  const accounts: AccountPreview[] = [];
  const allCodes = new Set<string>();

  // First pass: collect all codes for hierarchy
  for (const row of rows) {
    const code = accountNumberIdx !== undefined ? (row[accountNumberIdx] ?? '').trim() : '';
    if (code) allCodes.add(code);
  }

  // Build children set for isPosting detection
  const childrenOf = new Set<string>();
  for (const [, parentCode] of hierarchy.relationships) {
    childrenOf.add(parentCode);
  }
  // Also check explicit parent column
  if (parentIdx !== undefined) {
    for (const row of rows) {
      const parent = (row[parentIdx] ?? '').trim();
      if (parent) childrenOf.add(parent);
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // 1-indexed + header row
    if (skipRows.has(rowNumber)) continue;

    const row = rows[i]!;

    const code = accountNumberIdx !== undefined ? (row[accountNumberIdx] ?? '').trim() : '';
    const name = nameIdx !== undefined ? (row[nameIdx] ?? '').trim() : '';
    const rawType = typeIdx !== undefined ? (row[typeIdx] ?? '').trim() : '';
    const rawDetailType = detailTypeIdx !== undefined ? (row[detailTypeIdx] ?? '').trim() : '';
    const rawActive = activeIdx !== undefined ? (row[activeIdx] ?? '').trim().toLowerCase() : '';

    // Skip empty rows
    if (!code && !name) continue;

    // Build raw values map
    const rawValues: Record<string, string> = {};
    for (const mapping of columnMappings) {
      rawValues[mapping.sourceColumn] = row[mapping.sourceIndex] ?? '';
    }

    // Infer type (may use parent context)
    let parentCode: string | null = null;

    // Resolve parent: explicit column first, then hierarchy detection
    if (parentIdx !== undefined) {
      parentCode = (row[parentIdx] ?? '').trim() || null;
    }
    if (!parentCode && hierarchy.relationships.has(code)) {
      parentCode = hierarchy.relationships.get(code)!;
    }

    // Get parent type for inference
    const parentType = parentCode ? inferredTypes.get(
      rows.findIndex((r) => (r[accountNumberIdx ?? -1] ?? '').trim() === parentCode),
    ) : undefined;

    const inference = inferAccountType(
      code, name, rawType || undefined, rawDetailType || undefined, parentType,
    );

    // Apply row overrides
    const override = options?.rowOverrides?.[rowNumber];

    // Determine isActive
    let isActive = true;
    if (rawActive) {
      isActive = !['false', '0', 'no', 'inactive', 'disabled'].includes(rawActive);
    }

    // Determine isPosting (a header account has children)
    const isPosting = !childrenOf.has(code);

    const preview: AccountPreview = {
      rowNumber,
      rawValues,
      accountNumber: override?.accountNumber ?? code,
      name: override?.name ?? name,
      accountType: override?.accountType ?? inference.accountType,
      typeConfidence: override?.accountType ? 100 : inference.confidence,
      typeReason: override?.accountType ? 'User override' : inference.reason,
      normalBalance: resolveNormalBalance(override?.accountType ?? inference.accountType),
      parentAccountNumber: override?.parentAccountNumber !== undefined
        ? override.parentAccountNumber
        : parentCode,
      classificationName: classIdx !== undefined ? (row[classIdx] ?? '').trim() || null : null,
      description: descIdx !== undefined ? (row[descIdx] ?? '').trim() || null : null,
      isActive: override?.isActive ?? isActive,
      isPosting: override?.isPosting ?? isPosting,
      issues: [], // populated by validation engine
    };

    accounts.push(preview);
  }

  return accounts;
}
