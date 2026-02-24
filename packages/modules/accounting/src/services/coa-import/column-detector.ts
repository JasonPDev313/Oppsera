/**
 * Intelligent column detection engine.
 *
 * Analyzes file headers AND sample values to determine which columns
 * map to which OppsEra fields. Produces confidence scores with explanations.
 *
 * Detection signals:
 *   1. Header name matching (weighted aliases)
 *   2. Value pattern analysis (numeric codes, type keywords, boolean patterns)
 *   3. Uniqueness analysis (codes should be unique, types should repeat)
 *   4. Statistical properties (value distribution, null rate)
 */

import type { ColumnMapping, TargetField } from './types';

// ── Weighted Header Aliases ─────────────────────────────────────────
// Higher weight = stronger signal

interface AliasEntry {
  patterns: string[];
  weight: number;
}

const FIELD_ALIASES: Record<TargetField, AliasEntry[]> = {
  accountNumber: [
    { patterns: ['account_number', 'accountnumber', 'acct_no', 'acct_num', 'account_no', 'account_num'], weight: 95 },
    { patterns: ['account #', 'acct #', 'account#', 'acct#'], weight: 90 },
    { patterns: ['number', 'num', 'no', 'no.'], weight: 50 },
    { patterns: ['code', 'gl_code', 'gl code', 'account code'], weight: 80 },
    { patterns: ['acct', 'account'], weight: 40 },
  ],
  name: [
    { patterns: ['account_name', 'accountname', 'acct_name'], weight: 95 },
    { patterns: ['name', 'title', 'label'], weight: 70 },
    { patterns: ['description'], weight: 40 }, // could also be description field
    { patterns: ['account'], weight: 30 },
  ],
  accountType: [
    { patterns: ['account_type', 'accounttype', 'acct_type'], weight: 95 },
    { patterns: ['type', 'category', 'account type'], weight: 80 },
    { patterns: ['class'], weight: 40 },
  ],
  detailType: [
    { patterns: ['detail_type', 'detailtype', 'detail type', 'sub_type', 'subtype'], weight: 95 },
    { patterns: ['sub type', 'subcategory', 'sub category'], weight: 70 },
  ],
  parentAccountNumber: [
    { patterns: ['parent_account_number', 'parent_account', 'parent_acct'], weight: 95 },
    { patterns: ['parent', 'parent_number', 'parent_no', 'parent_acct_no'], weight: 85 },
    { patterns: ['parent account'], weight: 80 },
  ],
  classificationName: [
    { patterns: ['classification', 'classification_name'], weight: 95 },
    { patterns: ['class', 'group', 'section'], weight: 50 },
  ],
  description: [
    { patterns: ['description', 'desc'], weight: 80 },
    { patterns: ['notes', 'memo', 'detail', 'comment'], weight: 60 },
  ],
  isActive: [
    { patterns: ['is_active', 'isactive', 'active'], weight: 95 },
    { patterns: ['status', 'enabled'], weight: 60 },
  ],
  isSubAccount: [
    { patterns: ['is_sub_account', 'issubaccount', 'sub_account', 'subaccount'], weight: 95 },
    { patterns: ['is sub', 'sub account'], weight: 80 },
  ],
  ignore: [],
};

// ── Value Pattern Detectors ─────────────────────────────────────────

const ACCOUNT_TYPE_KEYWORDS = new Set([
  'asset', 'assets', 'liability', 'liabilities', 'equity', 'revenue', 'income',
  'expense', 'expenses', 'cogs', 'cost of goods', 'cost of sales', 'other income',
  'other expense', 'bank', 'accounts receivable', 'accounts payable',
  'current asset', 'fixed asset', 'long term liability',
]);

const BOOLEAN_VALUES = new Set([
  'true', 'false', 'yes', 'no', '1', '0', 'active', 'inactive', 'enabled', 'disabled',
]);

// ── Main Detection Engine ───────────────────────────────────────────

export function detectColumns(
  headers: string[],
  sampleRows: string[][],
  allRows: string[][],
): ColumnMapping[] {
  const candidates: Array<{
    sourceIndex: number;
    sourceColumn: string;
    targetField: TargetField;
    confidence: number;
    reason: string;
    sampleValues: string[];
  }> = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx]!;
    const values = allRows.map((r) => r[colIdx] ?? '').filter(Boolean);
    const sampleValues = [...new Set(sampleRows.map((r) => r[colIdx] ?? '').filter(Boolean))].slice(0, 5);

    // Score each possible target field
    const scores: Array<{ field: TargetField; score: number; reason: string }> = [];

    for (const [field, aliasGroups] of Object.entries(FIELD_ALIASES) as [TargetField, AliasEntry[]][]) {
      if (field === 'ignore') continue;

      let headerScore = 0;
      let headerReason = '';

      // 1. Header name matching
      const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim();
      for (const group of aliasGroups) {
        if (group.patterns.includes(normalizedHeader)) {
          headerScore = group.weight;
          headerReason = `Header "${header}" matches known alias for ${field}`;
          break;
        }
        // Partial match
        for (const pattern of group.patterns) {
          if (normalizedHeader.includes(pattern) || pattern.includes(normalizedHeader)) {
            const partialScore = Math.round(group.weight * 0.7);
            if (partialScore > headerScore) {
              headerScore = partialScore;
              headerReason = `Header "${header}" partially matches "${pattern}" for ${field}`;
            }
          }
        }
      }

      // 2. Value-based scoring (adds up to 30 points)
      let valueScore = 0;
      let valueReason = '';

      if (values.length > 0) {
        const analysis = analyzeColumnValues(values, field);
        valueScore = analysis.score;
        valueReason = analysis.reason;
      }

      const totalScore = Math.min(100, headerScore + valueScore);
      if (totalScore > 0) {
        const reasons = [headerReason, valueReason].filter(Boolean).join('; ');
        scores.push({ field, score: totalScore, reason: reasons });
      }
    }

    // Pick the best match
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    if (best && best.score >= 20) {
      candidates.push({
        sourceIndex: colIdx,
        sourceColumn: header,
        targetField: best.field,
        confidence: best.score,
        reason: best.reason,
        sampleValues,
      });
    } else {
      candidates.push({
        sourceIndex: colIdx,
        sourceColumn: header,
        targetField: 'ignore',
        confidence: 0,
        reason: `No matching OppsEra field found for column "${header}"`,
        sampleValues,
      });
    }
  }

  // Resolve conflicts: if multiple columns map to the same field, keep the highest confidence
  return resolveConflicts(candidates);
}

// ── Value Analysis ──────────────────────────────────────────────────

function analyzeColumnValues(
  values: string[],
  candidateField: TargetField,
): { score: number; reason: string } {
  const total = values.length;
  if (total === 0) return { score: 0, reason: '' };

  const uniqueValues = new Set(values);
  const uniqueRatio = uniqueValues.size / total;

  switch (candidateField) {
    case 'accountNumber': {
      // Account numbers: mostly unique, often numeric or alphanumeric codes
      const codePattern = /^[A-Za-z0-9\-._]{1,20}$/;
      const codeMatches = values.filter((v) => codePattern.test(v)).length;
      const codeRatio = codeMatches / total;

      if (uniqueRatio > 0.95 && codeRatio > 0.9) {
        return { score: 25, reason: 'Values are mostly unique code-like strings' };
      }
      if (uniqueRatio > 0.8 && codeRatio > 0.7) {
        return { score: 15, reason: 'Values have high uniqueness and code-like format' };
      }
      return { score: 0, reason: '' };
    }

    case 'name': {
      // Names: mixed case, longer strings, moderate uniqueness
      const avgLen = values.reduce((s, v) => s + v.length, 0) / total;
      const hasMixedCase = values.some((v) => v !== v.toLowerCase() && v !== v.toUpperCase());

      if (avgLen > 10 && hasMixedCase && uniqueRatio > 0.7) {
        return { score: 20, reason: 'Values are descriptive text with high uniqueness' };
      }
      if (avgLen > 5 && uniqueRatio > 0.5) {
        return { score: 10, reason: 'Values appear to be account names' };
      }
      return { score: 0, reason: '' };
    }

    case 'accountType': {
      // Types: low cardinality, matches known type keywords
      const typeMatches = values.filter((v) =>
        ACCOUNT_TYPE_KEYWORDS.has(v.toLowerCase()),
      ).length;
      const typeRatio = typeMatches / total;

      if (typeRatio > 0.8 && uniqueValues.size <= 20) {
        return { score: 30, reason: 'Values match known account type keywords' };
      }
      if (typeRatio > 0.5) {
        return { score: 20, reason: 'Many values match account type keywords' };
      }
      if (uniqueValues.size <= 10 && uniqueRatio < 0.3) {
        return { score: 5, reason: 'Low cardinality — could be a type column' };
      }
      return { score: 0, reason: '' };
    }

    case 'detailType': {
      // Detail types: moderate cardinality, often descriptive
      if (uniqueValues.size >= 5 && uniqueValues.size <= 50 && uniqueRatio < 0.5) {
        return { score: 10, reason: 'Moderate cardinality consistent with detail types' };
      }
      return { score: 0, reason: '' };
    }

    case 'parentAccountNumber': {
      // Parent: similar format to accountNumber, high null rate
      const codePattern = /^[A-Za-z0-9\-._]{1,20}$/;
      const nonEmpty = values.filter(Boolean);
      const nullRate = 1 - (nonEmpty.length / total);
      const codeMatches = nonEmpty.filter((v) => codePattern.test(v)).length;

      if (nullRate > 0.3 && nullRate < 0.95 && codeMatches / Math.max(nonEmpty.length, 1) > 0.8) {
        return { score: 20, reason: 'Has empty values and non-empty code-like values (parent pattern)' };
      }
      return { score: 0, reason: '' };
    }

    case 'isActive': {
      // Boolean-like values
      const boolMatches = values.filter((v) => BOOLEAN_VALUES.has(v.toLowerCase())).length;
      if (boolMatches / total > 0.9) {
        return { score: 25, reason: 'Values are boolean-like (true/false/yes/no)' };
      }
      return { score: 0, reason: '' };
    }

    case 'isSubAccount': {
      const boolMatches = values.filter((v) => BOOLEAN_VALUES.has(v.toLowerCase())).length;
      if (boolMatches / total > 0.9) {
        return { score: 15, reason: 'Values are boolean-like (sub-account flag)' };
      }
      return { score: 0, reason: '' };
    }

    case 'classificationName': {
      // Classification: low-moderate cardinality, text values
      if (uniqueValues.size >= 3 && uniqueValues.size <= 30 && uniqueRatio < 0.5) {
        return { score: 10, reason: 'Low cardinality text values (could be classification)' };
      }
      return { score: 0, reason: '' };
    }

    case 'description': {
      // Description: longer text, moderate uniqueness, often has nulls
      const avgLen = values.filter(Boolean).reduce((s, v) => s + v.length, 0) / Math.max(values.filter(Boolean).length, 1);
      if (avgLen > 20) {
        return { score: 10, reason: 'Values are long text (likely descriptions)' };
      }
      return { score: 0, reason: '' };
    }

    default:
      return { score: 0, reason: '' };
  }
}

// ── Conflict Resolution ─────────────────────────────────────────────

function resolveConflicts(
  candidates: Array<{
    sourceIndex: number;
    sourceColumn: string;
    targetField: TargetField;
    confidence: number;
    reason: string;
    sampleValues: string[];
  }>,
): ColumnMapping[] {
  // Group by target field
  const byField = new Map<TargetField, typeof candidates>();
  for (const c of candidates) {
    if (c.targetField === 'ignore') continue;
    const existing = byField.get(c.targetField) ?? [];
    existing.push(c);
    byField.set(c.targetField, existing);
  }

  // For each field, keep only the highest-confidence mapping
  const assigned = new Set<number>(); // column indexes already assigned
  const resolved: ColumnMapping[] = [];

  // Process required fields first (accountNumber, name), then others
  const fieldPriority: TargetField[] = [
    'accountNumber', 'name', 'accountType', 'parentAccountNumber',
    'detailType', 'classificationName', 'description', 'isActive', 'isSubAccount',
  ];

  for (const field of fieldPriority) {
    const fieldCandidates = (byField.get(field) ?? [])
      .filter((c) => !assigned.has(c.sourceIndex))
      .sort((a, b) => b.confidence - a.confidence);

    if (fieldCandidates.length > 0) {
      const winner = fieldCandidates[0]!;
      assigned.add(winner.sourceIndex);
      resolved.push({
        sourceColumn: winner.sourceColumn,
        sourceIndex: winner.sourceIndex,
        targetField: winner.targetField,
        confidence: winner.confidence,
        reason: winner.reason,
        sampleValues: winner.sampleValues,
      });
    }
  }

  // Add unmapped columns as 'ignore'
  for (const c of candidates) {
    if (!assigned.has(c.sourceIndex)) {
      resolved.push({
        sourceColumn: c.sourceColumn,
        sourceIndex: c.sourceIndex,
        targetField: 'ignore',
        confidence: 0,
        reason: c.targetField === 'ignore'
          ? c.reason
          : `Column "${c.sourceColumn}" was outscored by another column for field "${c.targetField}"`,
        sampleValues: c.sampleValues,
      });
    }
  }

  // Sort by original column order
  resolved.sort((a, b) => a.sourceIndex - b.sourceIndex);

  return resolved;
}
