// ── Few-Shot Retriever ───────────────────────────────────────────
// Retrieves similar past queries from the RAG training store and
// formats them as few-shot examples for injection into LLM prompts.
// Automatically increments usage counts on retrieved pairs.

import { findSimilar, incrementUsageCounts } from './training-store';
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
  /** Use composite scoring (similarity + quality + recency). Default: true */
  useCompositeScoring?: boolean;
  /** Diversity threshold (0.0-1.0). Skip pairs with >threshold similarity to already-selected. Default: 0.85 */
  diversityThreshold?: number;
}

// ── Defaults ────────────────────────────────────────────────────

const DEFAULT_MAX_EXAMPLES = 3;
const DEFAULT_MIN_SIMILARITY = 0.3;
const DEFAULT_DIVERSITY_THRESHOLD = 0.85;

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
  const useComposite = opts?.useCompositeScoring ?? true;
  const diversityThreshold = opts?.diversityThreshold ?? DEFAULT_DIVERSITY_THRESHOLD;

  // Fetch more than needed so we can filter by mode + diversity after retrieval
  const fetchLimit = maxExamples * 3;
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

  // Sort by composite score when enabled (combines similarity + quality + recency)
  if (useComposite) {
    filtered.sort((a, b) => b.compositeScore - a.compositeScore);
  }

  // Apply diversity filter: skip pairs too similar to already-selected ones
  const selected = selectDiverse(filtered, maxExamples, diversityThreshold);

  if (selected.length === 0) {
    return '';
  }

  // Best-effort batch usage count increment (fire-and-forget, never block retrieval)
  incrementUsageCounts(selected.map((p) => p.id)).catch(() => {
    // Swallow errors — usage tracking is non-critical
  });

  return formatAsPromptExamples(selected);
}

// ── Diversity Selection ──────────────────────────────────────────

/**
 * Greedily select up to `maxN` pairs, skipping any pair whose question
 * text overlaps too heavily (>threshold) with an already-selected pair.
 * This prevents near-duplicate examples from crowding out varied ones.
 *
 * Uses a simple token-overlap ratio as a lightweight diversity measure
 * (no extra DB queries or embeddings needed).
 */
function selectDiverse(
  sorted: SimilarTrainingPair[],
  maxN: number,
  threshold: number,
): SimilarTrainingPair[] {
  const selected: SimilarTrainingPair[] = [];

  for (const pair of sorted) {
    if (selected.length >= maxN) break;

    const tooSimilar = selected.some((s) => tokenOverlap(s.question, pair.question) > threshold);
    if (!tooSimilar) {
      selected.push(pair);
    }
  }

  return selected;
}

/**
 * Compute Jaccard token overlap between two questions (0.0-1.0).
 * Normalized lowercase word tokens with punctuation stripped — lightweight, no NLP deps.
 */
function tokenOverlap(a: string, b: string): number {
  const normalize = (s: string) =>
    new Set(s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
  const tokensA = normalize(a);
  const tokensB = normalize(b);
  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
