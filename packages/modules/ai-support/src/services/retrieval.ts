import { eq, and, ilike } from 'drizzle-orm';
import {
  db,
  aiSupportAnswerCards,
  aiAssistantAnswerMemory,
  aiSupportRouteManifests,
  aiSupportActionManifests,
} from '@oppsera/db';
import type { AiAssistantContext, SourceTier } from '../types';
import { semanticSearch } from './embedding-pipeline';

// ── Types ─────────────────────────────────────────────────────────

export interface RetrievalResult {
  tier: SourceTier;
  source: string;
  content: string;
}

export interface RetrieveEvidenceParams {
  route: string;
  moduleKey?: string;
  question: string;
  mode: 'customer' | 'staff';
  context: AiAssistantContext;
}

// ── Stage 1: Structured Retrieval ──────────────────────────────────

/**
 * T2: Answer cards matching route + question keywords.
 */
async function retrieveAnswerCards(
  context: AiAssistantContext,
  question: string,
): Promise<RetrievalResult[]> {
  const conditions = [eq(aiSupportAnswerCards.status, 'active')];
  if (context.moduleKey) {
    conditions.push(eq(aiSupportAnswerCards.moduleKey, context.moduleKey));
  }
  if (context.route) {
    conditions.push(eq(aiSupportAnswerCards.route, context.route));
  }

  const cards = await db
    .select()
    .from(aiSupportAnswerCards)
    .where(and(...conditions));

  const questionLower = question.toLowerCase();
  return cards
    .filter((card) => {
      const keywords = card.questionPattern.toLowerCase().split(/\s+/);
      return keywords.some((kw) => kw.length > 2 && questionLower.includes(kw));
    })
    .map((card) => ({
      tier: 't2' as SourceTier,
      source: `answer_card:${card.slug}`,
      content: card.approvedAnswerMarkdown,
    }));
}

/**
 * T3: Approved answer memory for similar questions.
 */
async function retrieveAnswerMemory(
  context: AiAssistantContext,
  question: string,
): Promise<RetrievalResult[]> {
  const normalized = question.toLowerCase().trim().replace(/\s+/g, ' ');

  const conditions = [
    eq(aiAssistantAnswerMemory.reviewStatus, 'approved'),
    ilike(aiAssistantAnswerMemory.questionNormalized, `%${normalized.slice(0, 100)}%`),
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
    // Skip low-quality matches (cosine similarity < 0.25)
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
      });
    } else if (INTERNAL_SOURCE_TYPES.has(r.sourceType)) {
      evidence.push({
        tier: 't6',
        source: `semantic_ref:${r.id}`,
        content,
      });
    } else if (mode === 'staff' && CODE_SOURCE_TYPES.has(r.sourceType)) {
      evidence.push({
        tier: 't7',
        source: `code_chunk:${r.id}`,
        content,
      });
    }
  }

  return evidence;
}

// ── Main Entry Point ───────────────────────────────────────────────

/**
 * Two-stage retrieval pipeline.
 *
 * Stage 1 (structured): T2 answer cards, T3 answer memory, T4 manifests.
 * Stage 2 (semantic):   T5/T6 vector similarity, T7 code chunks (staff only).
 *
 * Results are returned ranked by trust tier (lowest tier number = highest trust).
 * T2/T3 hits shadow semantic results — if structured evidence covers the question
 * well, the semantic results still appear but lower in the list.
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
  return [
    ...t2Results,
    ...t3Results,
    ...t4Results,
    ...semanticResults,
  ];
}
