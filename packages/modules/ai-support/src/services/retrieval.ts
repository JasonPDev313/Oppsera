import { eq, and, ilike, sql } from 'drizzle-orm';
import {
  db,
  aiSupportAnswerCards,
  aiAssistantAnswerMemory,
  aiSupportRouteManifests,
  aiSupportActionManifests,
} from '@oppsera/db';
import type { AiAssistantContext, SourceTier } from '../types';
import { semanticSearch } from './embedding-pipeline';
import { vectorSearchAnswerCards } from './card-embeddings';
import type { VectorSearchResult } from './card-embeddings';

// ── Types ─────────────────────────────────────────────────────────

export interface RetrievalResult {
  tier: SourceTier;
  source: string;
  content: string;
  /** Match quality score (0–1) for ranking within the same tier. */
  matchScore?: number;
}

export interface RetrieveEvidenceParams {
  route: string;
  moduleKey?: string;
  question: string;
  mode: 'customer' | 'staff';
  context: AiAssistantContext;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Escape ILIKE special characters to prevent wildcard injection. */
function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Score how well a question matches a pipe-delimited question pattern.
 * Returns a 0–1 score: 0 = no match, 1 = exact phrase match.
 *
 * Matching strategy (per pipe-delimited phrase):
 * 1. Exact phrase substring match → 0.8–1.0 (weighted by phrase length)
 * 2. All words in a phrase present in the question → 0.7
 * 3. Majority of words (≥50%) present → proportional (0.3–0.6)
 * 4. Below 50% word overlap → 0 (not meaningful)
 *
 * Best score across all phrases wins.
 */
function scoreQuestionMatch(questionLower: string, questionPattern: string): number {
  const phrases = questionPattern.toLowerCase().split('|').map((p) => p.trim()).filter(Boolean);
  if (phrases.length === 0) return 0;

  let bestScore = 0;

  for (const phrase of phrases) {
    // Exact phrase substring match (highest quality)
    if (questionLower.includes(phrase)) {
      // Longer phrase matches are higher quality
      const phraseWeight = Math.min(phrase.length / 30, 1);
      bestScore = Math.max(bestScore, 0.8 + 0.2 * phraseWeight);
      continue;
    }

    // Word-level matching for partial hits
    const phraseWords = phrase.split(/\s+/).filter((w) => w.length > 2);
    if (phraseWords.length === 0) continue;

    const matchedWords = phraseWords.filter((w) => questionLower.includes(w));
    const wordRatio = matchedWords.length / phraseWords.length;

    if (wordRatio >= 1.0) {
      // All words present but not as a contiguous phrase
      bestScore = Math.max(bestScore, 0.7);
    } else if (wordRatio >= 0.5) {
      // Majority of words present — proportional score
      bestScore = Math.max(bestScore, wordRatio * 0.6);
    }
    // Below 50% word match: not a meaningful match → skip
  }

  return bestScore;
}

/** Minimum match score for an answer card to be considered relevant. */
const ANSWER_CARD_MIN_SCORE = 0.25;

/** Maximum answer cards to return per query. */
const ANSWER_CARD_MAX_RESULTS = 5;

/** Minimum vector similarity to consider a match (cosine similarity, 0–1). */
const VECTOR_MIN_SIMILARITY = 0.3;

/** RRF constant k — controls how much rank position matters vs. just being in the list. */
const RRF_K = 60;

// ── Reciprocal Rank Fusion ─────────────────────────────────────────

interface RankedCard {
  id: string;
  slug: string;
  questionPattern: string;
  approvedAnswerMarkdown: string;
  summary: string | null;
  moduleKey: string | null;
  route: string | null;
  /** Fused score from RRF merge. */
  rrfScore: number;
  /** Best individual score for confidence computation. */
  bestIndividualScore: number;
}

/**
 * Reciprocal Rank Fusion: merge two ranked lists into one.
 *
 * For each item, RRF score = sum over lists of 1/(k + rank).
 * Items that appear in both lists get boosted; items in only one list
 * still contribute. This naturally handles the case where keyword matching
 * finds exact terms and vector search finds paraphrases.
 */
function reciprocalRankFusion(
  keywordResults: Array<{
    id: string;
    slug: string;
    questionPattern: string;
    approvedAnswerMarkdown: string;
    summary: string | null;
    moduleKey: string | null;
    route: string | null;
    keywordScore: number;
  }>,
  vectorResults: VectorSearchResult[],
): RankedCard[] {
  const fusedMap = new Map<string, RankedCard>();

  // Score keyword results by rank
  for (let rank = 0; rank < keywordResults.length; rank++) {
    const item = keywordResults[rank]!;
    const rrfContribution = 1 / (RRF_K + rank + 1);

    const existing = fusedMap.get(item.id);
    if (existing) {
      existing.rrfScore += rrfContribution;
      existing.bestIndividualScore = Math.max(existing.bestIndividualScore, item.keywordScore);
    } else {
      fusedMap.set(item.id, {
        id: item.id,
        slug: item.slug,
        questionPattern: item.questionPattern,
        approvedAnswerMarkdown: item.approvedAnswerMarkdown,
        summary: item.summary,
        moduleKey: item.moduleKey,
        route: item.route,
        rrfScore: rrfContribution,
        bestIndividualScore: item.keywordScore,
      });
    }
  }

  // Score vector results by rank
  for (let rank = 0; rank < vectorResults.length; rank++) {
    const item = vectorResults[rank]!;
    const rrfContribution = 1 / (RRF_K + rank + 1);

    const existing = fusedMap.get(item.id);
    if (existing) {
      existing.rrfScore += rrfContribution;
      existing.bestIndividualScore = Math.max(existing.bestIndividualScore, item.similarity);
    } else {
      fusedMap.set(item.id, {
        id: item.id,
        slug: item.slug,
        questionPattern: item.questionPattern,
        approvedAnswerMarkdown: item.approvedAnswerMarkdown,
        summary: item.summary,
        moduleKey: item.moduleKey,
        route: item.route,
        rrfScore: rrfContribution,
        bestIndividualScore: item.similarity,
      });
    }
  }

  // Sort by fused score descending
  return Array.from(fusedMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

// ── Stage 1: Structured Retrieval ──────────────────────────────────

/**
 * T2: Hybrid answer card retrieval — keyword matching + vector similarity,
 * merged via Reciprocal Rank Fusion (RRF).
 *
 * Keyword path: loads active cards matching module/route, scores via
 * scoreQuestionMatch (pipe-delimited phrase matching).
 *
 * Vector path: pgvector cosine similarity search against card embeddings.
 * Catches paraphrased questions that keyword matching misses.
 *
 * RRF merge: cards appearing in both lists get boosted. The top result
 * gets the full answer body; positions 2–5 get the compressed summary
 * (if available) to save tokens.
 */
async function retrieveAnswerCards(
  context: AiAssistantContext,
  question: string,
): Promise<RetrievalResult[]> {
  // ── Keyword Search (existing approach) ──
  const keywordPromise = (async () => {
    const conditions = [eq(aiSupportAnswerCards.status, 'active')];

    if (context.moduleKey) {
      conditions.push(
        sql`(${aiSupportAnswerCards.moduleKey} = ${context.moduleKey} OR ${aiSupportAnswerCards.moduleKey} IS NULL)`,
      );
    }

    if (context.route) {
      const escapedRoute = escapeIlike(context.route);
      conditions.push(
        sql`(${aiSupportAnswerCards.route} IS NULL OR ${escapedRoute} LIKE ${aiSupportAnswerCards.route} || '%')`,
      );
    }

    const cards = await db
      .select({
        id: aiSupportAnswerCards.id,
        slug: aiSupportAnswerCards.slug,
        questionPattern: aiSupportAnswerCards.questionPattern,
        approvedAnswerMarkdown: aiSupportAnswerCards.approvedAnswerMarkdown,
        summary: aiSupportAnswerCards.summary,
        moduleKey: aiSupportAnswerCards.moduleKey,
        route: aiSupportAnswerCards.route,
      })
      .from(aiSupportAnswerCards)
      .where(and(...conditions));

    const questionLower = question.toLowerCase().trim();

    return cards
      .map((card) => ({
        ...card,
        keywordScore: scoreQuestionMatch(questionLower, card.questionPattern),
      }))
      .filter((c) => c.keywordScore >= ANSWER_CARD_MIN_SCORE)
      .sort((a, b) => b.keywordScore - a.keywordScore)
      .slice(0, 10); // Fetch top 10 for RRF merge (will be capped to 5 after fusion)
  })();

  // ── Vector Search (new pgvector path) ──
  const vectorPromise = vectorSearchAnswerCards(
    question,
    context.moduleKey,
    10,
  ).then((results) =>
    // Apply route prefix filter (vector search doesn't filter by route)
    results.filter((r) => {
      if (r.similarity < VECTOR_MIN_SIMILARITY) return false;
      if (!context.route || !r.route) return true;
      return context.route.startsWith(r.route);
    }),
  );

  // Run both in parallel
  const [keywordResults, vectorResults] = await Promise.all([
    keywordPromise,
    vectorPromise,
  ]);

  // ── RRF Merge ──
  const fused = reciprocalRankFusion(keywordResults, vectorResults);

  // Cap to ANSWER_CARD_MAX_RESULTS
  const topCards = fused.slice(0, ANSWER_CARD_MAX_RESULTS);

  // Convert to RetrievalResult with token-saving strategy:
  // - Position 1: full answer body (top match, highest confidence)
  // - Positions 2–5: compressed summary if available (saves tokens)
  return topCards.map((card, index) => {
    // Use full body for top match, summary for rest (if summary exists)
    const useFullBody = index === 0 || !card.summary;
    const content = useFullBody ? card.approvedAnswerMarkdown : card.summary!;

    return {
      tier: 't2' as SourceTier,
      source: `answer_card:${card.slug}`,
      content,
      matchScore: card.bestIndividualScore,
    };
  });
}

/**
 * T3: Approved answer memory for similar questions.
 * Uses escaped ILIKE to prevent wildcard injection from user input.
 */
async function retrieveAnswerMemory(
  context: AiAssistantContext,
  question: string,
): Promise<RetrievalResult[]> {
  const normalized = question.toLowerCase().trim().replace(/\s+/g, ' ');
  const escaped = escapeIlike(normalized.slice(0, 100));

  const conditions = [
    eq(aiAssistantAnswerMemory.reviewStatus, 'approved'),
    ilike(aiAssistantAnswerMemory.questionNormalized, `%${escaped}%`),
  ];
  if (context.moduleKey) {
    conditions.push(eq(aiAssistantAnswerMemory.moduleKey, context.moduleKey));
  }

  const memories = await db
    .select()
    .from(aiAssistantAnswerMemory)
    .where(and(...conditions))
    .limit(3);

  return memories.map((m) => ({
    tier: 't3' as SourceTier,
    source: `answer_memory:${m.id}`,
    content: m.answerMarkdown,
  }));
}

/**
 * T4: Route manifest + action manifests for the current route.
 */
async function retrieveRouteManifest(
  context: AiAssistantContext,
): Promise<RetrievalResult[]> {
  if (!context.route) return [];

  const results: RetrievalResult[] = [];

  const [manifest] = await db
    .select()
    .from(aiSupportRouteManifests)
    .where(eq(aiSupportRouteManifests.route, context.route))
    .limit(1);

  if (manifest) {
    const manifestContent = [
      `Page: ${manifest.pageTitle}`,
      `Module: ${manifest.moduleKey}`,
      `Description: ${manifest.description}`,
      manifest.helpText ? `Help: ${manifest.helpText}` : null,
      manifest.tabsJson ? `Tabs: ${JSON.stringify(manifest.tabsJson)}` : null,
      manifest.actionsJson ? `Actions: ${JSON.stringify(manifest.actionsJson)}` : null,
      manifest.permissionsJson ? `Permissions: ${JSON.stringify(manifest.permissionsJson)}` : null,
      manifest.warningsJson ? `Warnings: ${JSON.stringify(manifest.warningsJson)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    results.push({
      tier: 't4',
      source: `route_manifest:${context.route}`,
      content: manifestContent,
    });
  }

  const actions = await db
    .select()
    .from(aiSupportActionManifests)
    .where(eq(aiSupportActionManifests.route, context.route));

  for (const action of actions) {
    results.push({
      tier: 't4',
      source: `action_manifest:${context.route}:${action.actionLabel}`,
      content: [
        `Action: ${action.actionLabel}`,
        action.handlerDescription ? `Description: ${action.handlerDescription}` : null,
        action.preconditionsJson ? `Preconditions: ${JSON.stringify(action.preconditionsJson)}` : null,
        action.confirmations ? `Confirmations: ${action.confirmations}` : null,
        action.successState ? `Success: ${action.successState}` : null,
        action.failureState ? `Failure: ${action.failureState}` : null,
        action.permissionKey ? `Permission: ${action.permissionKey}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  return results;
}

// ── Stage 2: Semantic Retrieval ────────────────────────────────────

/**
 * T5: Semantic search against customer-facing support artifacts
 * (source_type IN ('support_artifact', 'kb', 'release_note', 'approved_answer')).
 *
 * T6: Semantic search against internal reference artifacts
 * (source_type IN ('route_manifest', 'permissions', 'pr_summary')).
 *
 * T7 (staff only): Raw code-chunk documents.
 *
 * We run a single vector query and partition results by source_type
 * into the appropriate tier.
 */
async function retrieveSemantic(
  question: string,
  moduleKey: string | undefined,
  mode: 'customer' | 'staff',
): Promise<RetrievalResult[]> {
  const CUSTOMER_SOURCE_TYPES = new Set([
    'support_artifact',
    'kb',
    'release_note',
    'approved_answer',
  ]);
  const INTERNAL_SOURCE_TYPES = new Set([
    'route_manifest',
    'permissions',
    'pr_summary',
  ]);
  const CODE_SOURCE_TYPES = new Set(['code_chunk']);

  // Fetch more results so we can split across tiers
  const semanticLimit = mode === 'staff' ? 10 : 6;

  let results: Awaited<ReturnType<typeof semanticSearch>>;
  try {
    results = await semanticSearch(question, moduleKey, semanticLimit);
  } catch (err) {
    // Embedding API unavailable — degrade gracefully
    console.warn('[retrieval] Semantic search unavailable:', err);
    return [];
  }

  const evidence: RetrievalResult[] = [];

  for (const r of results) {
    // Skip low-quality matches (keyword overlap < 0.25)
    if (r.score < 0.25) continue;

    const content = [
      r.title ? `# ${r.title}` : null,
      r.contentMarkdown ?? '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (CUSTOMER_SOURCE_TYPES.has(r.sourceType)) {
      evidence.push({
        tier: 't5',
        source: `semantic_doc:${r.id}`,
        content,
        matchScore: r.score,
      });
    } else if (INTERNAL_SOURCE_TYPES.has(r.sourceType)) {
      evidence.push({
        tier: 't6',
        source: `semantic_ref:${r.id}`,
        content,
        matchScore: r.score,
      });
    } else if (mode === 'staff' && CODE_SOURCE_TYPES.has(r.sourceType)) {
      evidence.push({
        tier: 't7',
        source: `code_chunk:${r.id}`,
        content,
        matchScore: r.score,
      });
    }
  }

  return evidence;
}

// ── Main Entry Point ───────────────────────────────────────────────

/**
 * Two-stage retrieval pipeline.
 *
 * Stage 1 (structured): T2 answer cards (hybrid keyword+vector with RRF),
 *                        T3 answer memory, T4 manifests.
 * Stage 2 (semantic):   T5/T6 keyword similarity, T7 code chunks (staff only).
 *
 * Results are returned ranked by trust tier (lowest tier number = highest trust),
 * then by match score within each tier.
 */
export async function retrieveEvidence(
  params: RetrieveEvidenceParams,
): Promise<RetrievalResult[]> {
  const { question, mode, context } = params;

  // Run stage-1 structured queries and stage-2 semantic in parallel
  const [t2Results, t3Results, t4Results, semanticResults] = await Promise.all([
    retrieveAnswerCards(context, question),
    retrieveAnswerMemory(context, question),
    retrieveRouteManifest(context),
    retrieveSemantic(question, context.moduleKey, mode),
  ]);

  // Tier order: t2 > t3 > t4 > t5 > t6 > t7
  // Within each tier, results are already sorted by matchScore (descending)
  let allResults = [
    ...t2Results,
    ...t3Results,
    ...t4Results,
    ...semanticResults,
  ];

  // Cap total evidence sent to the prompt: max 15 items, max 30,000 chars.
  // Results are already in trust-tier order (t2 first), so slicing from the
  // end drops the lowest-tier / lowest-confidence items first.
  if (allResults.length > 15) {
    allResults = allResults.slice(0, 15);
  }
  const EVIDENCE_CHAR_LIMIT = 30_000;
  let totalChars = allResults.reduce((sum, r) => sum + r.content.length, 0);
  while (totalChars > EVIDENCE_CHAR_LIMIT && allResults.length > 1) {
    const removed = allResults.pop()!;
    totalChars -= removed.content.length;
  }

  // Structured logging for retrieval quality — helps identify knowledge gaps
  if (allResults.length === 0) {
    console.warn(JSON.stringify({
      level: 'warn',
      event: 'ai_retrieval_miss',
      route: params.route,
      moduleKey: params.context.moduleKey ?? null,
      question: question.slice(0, 200),
      mode,
    }));
  } else if (!t2Results.length && !t3Results.length && !t4Results.length) {
    // Only semantic results (t5+) — no curated answers or manifests matched
    console.info(JSON.stringify({
      level: 'info',
      event: 'ai_retrieval_low_tier',
      route: params.route,
      moduleKey: params.context.moduleKey ?? null,
      question: question.slice(0, 200),
      bestTier: allResults[0]?.tier,
      resultCount: allResults.length,
    }));
  }

  return allResults;
}
