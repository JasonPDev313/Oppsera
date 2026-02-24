/**
 * Two-tier column detection engine.
 *
 * Tier 1: Deterministic alias matching (sub-millisecond, 200+ aliases)
 * Tier 2: AI mapping via Claude Haiku for unmatched columns
 *
 * Also detects transform candidates (Full Name → split, City/State/Zip → split).
 */

import { COLUMN_ALIASES, TARGET_FIELDS } from './column-aliases';
import type { ColumnMapping, DetectedTransform, AiMappingSuggestion } from './import-types';
import { callAiColumnMapper } from './ai-column-mapper';

// ── Alias Resolver ──────────────────────────────────────────────────

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim();
}

function resolveAlias(header: string): { fieldKey: string; confidence: number } | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [fieldKey, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) {
      return { fieldKey, confidence: 95 };
    }
  }
  return null;
}

// ── Transform Detection ─────────────────────────────────────────────

function detectTransforms(
  headers: string[],
  sampleRows: string[][],
  mappings: ColumnMapping[],
): DetectedTransform[] {
  const transforms: DetectedTransform[] = [];

  for (const mapping of mappings) {
    if (!mapping.targetField) continue;

    // Detect Full Name → split
    if (mapping.targetField === 'fullName') {
      transforms.push({
        sourceIndex: mapping.sourceIndex,
        sourceHeader: mapping.sourceHeader,
        type: 'split_name',
        description: 'Will split into First Name + Last Name',
        outputFields: ['firstName', 'lastName', 'prefix', 'suffix'],
      });
    }

    // Detect Combined City/State/Zip → split
    if (mapping.targetField === 'combinedCityStateZip') {
      transforms.push({
        sourceIndex: mapping.sourceIndex,
        sourceHeader: mapping.sourceHeader,
        type: 'split_address',
        description: 'Will split into City + State + Postal Code',
        outputFields: ['city', 'state', 'postalCode'],
      });
    }
  }

  // Also detect from data patterns for unmapped columns
  for (const mapping of mappings) {
    if (mapping.targetField !== null) continue;

    const colSamples = sampleRows
      .map((row) => row[mapping.sourceIndex] ?? '')
      .filter(Boolean)
      .slice(0, 10);

    // Detect "City, ST 12345" pattern in data
    const cityStateZipPattern = /^.+,\s*[A-Za-z]{2}\s+\d{5}/;
    const matchCount = colSamples.filter((s) => cityStateZipPattern.test(s)).length;
    if (matchCount > colSamples.length * 0.5 && matchCount >= 2) {
      mapping.targetField = 'combinedCityStateZip';
      mapping.confidence = 85;
      mapping.method = 'alias';
      mapping.reasoning = 'Data contains "City, ST ZIP" patterns — will auto-split';
      transforms.push({
        sourceIndex: mapping.sourceIndex,
        sourceHeader: mapping.sourceHeader,
        type: 'split_address',
        description: 'Will split into City + State + Postal Code',
        outputFields: ['city', 'state', 'postalCode'],
      });
    }
  }

  return transforms;
}

// ── Main Detector ───────────────────────────────────────────────────

export async function detectColumns(
  headers: string[],
  sampleRows: string[][],
): Promise<{ mappings: ColumnMapping[]; transforms: DetectedTransform[] }> {
  const mappings: ColumnMapping[] = [];
  const unmatchedIndices: number[] = [];
  const usedTargets = new Set<string>();

  // ── TIER 1: Deterministic alias matching ──
  for (let i = 0; i < headers.length; i++) {
    const result = resolveAlias(headers[i]!);
    if (result && !usedTargets.has(result.fieldKey)) {
      mappings.push({
        sourceHeader: headers[i]!,
        sourceIndex: i,
        targetField: result.fieldKey,
        confidence: result.confidence,
        method: 'alias',
        reasoning: `Matched alias "${normalizeHeader(headers[i]!)}" → ${result.fieldKey}`,
      });
      usedTargets.add(result.fieldKey);
    } else {
      unmatchedIndices.push(i);
      mappings.push({
        sourceHeader: headers[i]!,
        sourceIndex: i,
        targetField: null,
        confidence: 0,
        method: 'unmapped',
      });
    }
  }

  // ── TIER 2: AI mapping for unmatched columns ──
  if (unmatchedIndices.length > 0) {
    const unmatchedHeaders = unmatchedIndices.map((i) => headers[i]!);
    const unmatchedSamples = sampleRows.map(
      (row) => unmatchedIndices.map((i) => row[i] ?? ''),
    );
    const availableTargets = TARGET_FIELDS.filter((t) => !usedTargets.has(t.key));

    let aiSuggestions: AiMappingSuggestion[] = [];
    try {
      aiSuggestions = await callAiColumnMapper(unmatchedHeaders, unmatchedSamples, availableTargets);
    } catch {
      // LLM failure — leave all as unmapped, never block import
    }

    for (const suggestion of aiSuggestions) {
      if (!suggestion.suggestedField) continue;
      if (usedTargets.has(suggestion.suggestedField)) continue;

      const mappingIdx = mappings.findIndex(
        (m) => m.sourceHeader === suggestion.sourceHeader && m.method === 'unmapped',
      );
      if (mappingIdx === -1) continue;

      mappings[mappingIdx] = {
        ...mappings[mappingIdx]!,
        targetField: suggestion.suggestedField,
        confidence: Math.min(suggestion.confidence, 85), // cap AI at 85
        method: 'ai',
        reasoning: suggestion.reasoning,
      };
      usedTargets.add(suggestion.suggestedField);
    }
  }

  // Sort by source index
  mappings.sort((a, b) => a.sourceIndex - b.sourceIndex);

  // Detect transforms
  const transforms = detectTransforms(headers, sampleRows, mappings);

  return { mappings, transforms };
}
