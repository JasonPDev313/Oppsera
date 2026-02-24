// ── Few-Shot Retriever ───────────────────────────────────────────
// Retrieves similar past queries from the RAG training store and
// formats them as few-shot examples for injection into LLM prompts.
// Automatically increments usage counts on retrieved pairs.

import { findSimilar, incrementUsageCount } from './training-store';
import type { SimilarTrainingPair } from './training-store';

// ── Types ─────────────────────────────────────────────────────────

export interface FewShotRetrieverOptions {
  /** Maximum number of examples to return. Default: 3 */
  maxExamples?: number;
  /** Minimum similarity threshold (0.0-1.0). Default: 0.3 */
  minSimilarity?: number;
  /** Include examples with mode='metrics'. Default: true */
  includeMetricsMode?: boolean;
  /** Include examples with mode='sql'. Default: true */
  includeSqlMode?: boolean;
}

// ── Defaults ────────────────────────────────────────────────────

const DEFAULT_MAX_EXAMPLES = 3;
const DEFAULT_MIN_SIMILARITY = 0.3;

// ── Public API ──────────────────────────────────────────────────

/**
 * Retrieve few-shot examples similar to the given question, formatted
 * as a prompt-ready string block. Returns an empty string if no
 * sufficiently similar training pairs are found.
 *
 * Side effect: increments usage_count on each retrieved pair (best-effort).
 */
export async function retrieveFewShotExamples(
  question: string,
  tenantId: string,
  opts?: FewShotRetrieverOptions,
): Promise<string> {
  const maxExamples = opts?.maxExamples ?? DEFAULT_MAX_EXAMPLES;
  const minSimilarity = opts?.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const includeMetrics = opts?.includeMetricsMode ?? true;
  const includeSql = opts?.includeSqlMode ?? true;

  // Fetch more than needed so we can filter by mode after retrieval
  const fetchLimit = maxExamples * 2;
  const allPairs = await findSimilar(question, tenantId, fetchLimit);

  // Filter by mode preference and minimum similarity
  let filtered = allPairs.filter((p) => p.similarity >= minSimilarity);

  if (!includeMetrics || !includeSql) {
    filtered = filtered.filter((p) => {
      if (p.mode === 'metrics' && !includeMetrics) return false;
      if (p.mode === 'sql' && !includeSql) return false;
      return true;
    });
  }

  // Take up to maxExamples
  const selected = filtered.slice(0, maxExamples);

  if (selected.length === 0) {
    return '';
  }

  // Best-effort usage count increment (fire-and-forget, never block retrieval)
  for (const pair of selected) {
    incrementUsageCount(pair.id).catch(() => {
      // Swallow errors — usage tracking is non-critical
    });
  }

  return formatAsPromptExamples(selected);
}

/**
 * Format an array of similar training pairs into a markdown string block
 * suitable for injection into an LLM system or user prompt.
 *
 * Each example shows the similarity score, original question, mode,
 * and either the plan (for metrics mode) or compiled SQL (for sql mode).
 */
export function formatAsPromptExamples(pairs: SimilarTrainingPair[]): string {
  if (pairs.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## Similar Past Queries (verified correct)',
    'These are previously validated queries similar to the current question. Use them as reference:',
    '',
  ];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    const similarityPct = Math.round(pair.similarity * 100);

    lines.push(`### Past Query ${i + 1} (${similarityPct}% similar)`);
    lines.push(`Question: "${pair.question}"`);
    lines.push(`Mode: ${pair.mode}`);

    if (pair.plan != null) {
      lines.push('Plan:');
      lines.push('```json');
      lines.push(JSON.stringify(pair.plan, null, 2));
      lines.push('```');
    }

    if (pair.compiledSql != null) {
      lines.push(`SQL: ${pair.compiledSql}`);
    }

    if (pair.qualityScore != null) {
      lines.push(`Quality Score: ${pair.qualityScore.toFixed(2)}`);
    }

    // Add blank line between examples
    if (i < pairs.length - 1) {
      lines.push('');
    }
  }

  return lines.join('\n');
}
