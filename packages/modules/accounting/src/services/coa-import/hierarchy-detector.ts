/**
 * Hierarchy detection engine.
 *
 * Detects parent-child relationships from multiple signals:
 *   1. Explicit parent column (if detected)
 *   2. Code prefix patterns (e.g., 4000 parent, 4010/4020 children)
 *   3. Indentation/sub-account markers
 *
 * Returns the best-scoring strategy with detected relationships.
 */

import type { AccountType, ColumnMapping, HierarchyDetectionResult } from './types';

// ── Main Detection ──────────────────────────────────────────────────

export function detectHierarchy(
  rows: string[][],
  columnMappings: ColumnMapping[],
  inferredTypes: Map<number, AccountType>,
): HierarchyDetectionResult {
  const strategies: HierarchyDetectionResult[] = [];

  // 1. Check for explicit parent column
  const parentMapping = columnMappings.find((m) => m.targetField === 'parentAccountNumber');
  if (parentMapping) {
    const result = detectParentColumn(rows, columnMappings, parentMapping);
    if (result) strategies.push(result);
  }

  // 2. Check for sub-account flag + parent column combination
  const subAccountMapping = columnMappings.find((m) => m.targetField === 'isSubAccount');
  if (subAccountMapping && parentMapping) {
    // Sub-account flag strengthens the parent column strategy
    const existing = strategies.find((s) => s.strategy === 'parent_column');
    if (existing) {
      existing.confidence = Math.min(100, existing.confidence + 10);
      existing.reason += '; sub-account flag column confirms hierarchy';
    }
  }

  // 3. Check for code prefix hierarchy
  const codeMapping = columnMappings.find((m) => m.targetField === 'accountNumber');
  if (codeMapping) {
    const result = detectCodePrefix(rows, codeMapping, inferredTypes);
    if (result) strategies.push(result);
  }

  // 4. Check for indentation-based hierarchy
  const nameMapping = columnMappings.find((m) => m.targetField === 'name');
  if (nameMapping && codeMapping) {
    const result = detectIndentation(rows, nameMapping, codeMapping);
    if (result) strategies.push(result);
  }

  // Return best strategy
  strategies.sort((a, b) => b.confidence - a.confidence);

  if (strategies.length > 0 && strategies[0]!.confidence >= 30) {
    return strategies[0]!;
  }

  return {
    strategy: 'none',
    confidence: 100,
    reason: 'No hierarchy structure detected — accounts will be imported as a flat list',
    relationships: new Map(),
  };
}

// ── Strategy 1: Parent Column ───────────────────────────────────────

function detectParentColumn(
  rows: string[][],
  columnMappings: ColumnMapping[],
  parentMapping: ColumnMapping,
): HierarchyDetectionResult | null {
  const codeMapping = columnMappings.find((m) => m.targetField === 'accountNumber');
  if (!codeMapping) return null;

  const relationships = new Map<string, string>();
  const allCodes = new Set<string>();
  let validRefs = 0;
  let totalRefs = 0;

  for (const row of rows) {
    const code = row[codeMapping.sourceIndex]?.trim() ?? '';
    const parent = row[parentMapping.sourceIndex]?.trim() ?? '';
    if (code) allCodes.add(code);
    if (parent) {
      totalRefs++;
      relationships.set(code, parent);
    }
  }

  // Validate: parent references should point to existing codes
  for (const [, parentCode] of relationships) {
    if (allCodes.has(parentCode)) validRefs++;
  }

  if (totalRefs === 0) return null;

  const validRatio = validRefs / totalRefs;
  const confidence = Math.round(
    Math.min(100, parentMapping.confidence * 0.6 + validRatio * 40),
  );

  return {
    strategy: 'parent_column',
    confidence,
    reason: `Parent column "${parentMapping.sourceColumn}" found with ${totalRefs} references (${Math.round(validRatio * 100)}% valid)`,
    relationships,
  };
}

// ── Strategy 2: Code Prefix ─────────────────────────────────────────

function detectCodePrefix(
  rows: string[][],
  codeMapping: ColumnMapping,
  inferredTypes: Map<number, AccountType>,
): HierarchyDetectionResult | null {
  const codes = rows
    .map((r, i) => ({ code: r[codeMapping.sourceIndex]?.trim() ?? '', rowIdx: i }))
    .filter((c) => c.code.length > 0);

  if (codes.length < 5) return null;

  // Detect separator character
  const separators = ['-', '.', '_'];
  let bestSep: string | undefined;
  let bestSepCount = 0;

  for (const sep of separators) {
    const count = codes.filter((c) => c.code.includes(sep)).length;
    if (count > bestSepCount) {
      bestSepCount = count;
      bestSep = sep;
    }
  }

  // Try separator-based hierarchy (e.g., "4-1000" → parent "4", or "4000-10" → parent "4000")
  if (bestSep && bestSepCount > codes.length * 0.3) {
    const result = detectSeparatorHierarchy(codes.map((c) => c.code), bestSep);
    if (result) return result;
  }

  // Try pure numeric prefix hierarchy (e.g., 4000 parent, 4010/4020/4100 children)
  const numericCodes = codes.filter((c) => /^\d+$/.test(c.code));
  if (numericCodes.length > codes.length * 0.8) {
    return detectNumericPrefixHierarchy(
      numericCodes.map((c) => ({ code: c.code, type: inferredTypes.get(c.rowIdx) })),
    );
  }

  return null;
}

function detectSeparatorHierarchy(
  codes: string[],
  separator: string,
): HierarchyDetectionResult | null {
  const relationships = new Map<string, string>();
  const codeSet = new Set(codes);

  for (const code of codes) {
    const parts = code.split(separator);
    if (parts.length >= 2) {
      // Try progressively shorter prefixes as potential parents
      for (let i = parts.length - 1; i >= 1; i--) {
        const parentCode = parts.slice(0, i).join(separator);
        if (codeSet.has(parentCode)) {
          relationships.set(code, parentCode);
          break;
        }
      }
    }
  }

  if (relationships.size < 3) return null;

  return {
    strategy: 'code_prefix',
    confidence: Math.round(Math.min(85, 50 + (relationships.size / codes.length) * 35)),
    reason: `Detected hierarchy via "${separator}" separator (${relationships.size} parent-child pairs)`,
    codeSeparator: separator,
    relationships,
  };
}

function detectNumericPrefixHierarchy(
  codes: Array<{ code: string; type?: AccountType }>,
): HierarchyDetectionResult | null {
  const relationships = new Map<string, string>();
  const codeNums = codes.map((c) => ({ num: parseInt(c.code, 10), code: c.code, type: c.type }));
  const codeSet = new Set(codes.map((c) => c.code));

  // Group by type (same type accounts tend to share hierarchy)
  // For each code, check if truncating to a rounder number yields a parent
  for (const item of codeNums) {
    if (isNaN(item.num)) continue;

    // Try to find a parent by looking at codes that are "rounder" versions
    // e.g., 4010 → parent 4000; 41100 → parent 41000 → parent 40000
    const codeStr = item.code;
    for (let trimLen = 1; trimLen < codeStr.length; trimLen++) {
      const prefix = codeStr.slice(0, codeStr.length - trimLen);
      const parentCandidate = prefix + '0'.repeat(trimLen);
      if (parentCandidate !== codeStr && codeSet.has(parentCandidate)) {
        relationships.set(codeStr, parentCandidate);
        break;
      }
    }
  }

  if (relationships.size < 3) return null;

  return {
    strategy: 'code_prefix',
    confidence: Math.round(Math.min(75, 40 + (relationships.size / codes.length) * 35)),
    reason: `Detected numeric prefix hierarchy (${relationships.size} parent-child pairs from code patterns like X000 → X0X0)`,
    relationships,
  };
}

// ── Strategy 3: Indentation ─────────────────────────────────────────

function detectIndentation(
  rows: string[][],
  nameMapping: ColumnMapping,
  codeMapping: ColumnMapping,
): HierarchyDetectionResult | null {
  const relationships = new Map<string, string>();
  let indentedCount = 0;
  const levelStack: Array<{ code: string; indent: number }> = [];

  for (const row of rows) {
    const rawName = row[nameMapping.sourceIndex] ?? '';
    const code = row[codeMapping.sourceIndex]?.trim() ?? '';
    if (!code) continue;

    // Detect indentation (leading spaces or specific prefixes)
    const leadingSpaces = rawName.length - rawName.trimStart().length;
    const colonIndent = rawName.match(/^(:+)/)?.[1]?.length ?? 0;
    const indent = Math.max(leadingSpaces, colonIndent * 2);

    if (indent > 0) indentedCount++;

    // Build hierarchy from indentation levels
    while (levelStack.length > 0 && levelStack[levelStack.length - 1]!.indent >= indent) {
      levelStack.pop();
    }

    if (levelStack.length > 0) {
      relationships.set(code, levelStack[levelStack.length - 1]!.code);
    }

    levelStack.push({ code, indent });
  }

  if (indentedCount < 3) return null;

  return {
    strategy: 'indentation',
    confidence: Math.round(Math.min(70, 30 + (indentedCount / rows.length) * 40)),
    reason: `Detected ${indentedCount} indented accounts suggesting hierarchy`,
    relationships,
  };
}
