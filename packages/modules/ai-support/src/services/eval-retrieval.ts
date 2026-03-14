/**
 * eval-retrieval.ts
 *
 * Thin retrieval helper used by the eval runner.
 * Calls the same T2/T3/T4 retrieval functions as the orchestrator but
 * returns structured evidence without making an LLM call. This keeps
 * evaluation cheap and deterministic.
 *
 * Not exported from the module barrel — internal to evaluation only.
 */

import { eq, and, ilike } from 'drizzle-orm';
import {
  db,
  aiSupportAnswerCards,
  aiAssistantAnswerMemory,
  aiSupportRouteManifests,
  aiSupportActionManifests,
} from '@oppsera/db';
import type { AiAssistantContext, SourceTier, ConfidenceLevel } from '../types';
import { CONFIDENCE_THRESHOLDS } from '../constants';

export interface EvalEvidence {
  tier: SourceTier;
  source: string;
  content: string;
}

export interface EvalRetrievalResult {
  evidence: EvalEvidence[];
  confidence: ConfidenceLevel;
  sourceTier: SourceTier;
}

const TIER_SCORES: Record<string, number> = {
  t1: 1.0,
  t2: 0.9,
  t3: 0.85,
  t4: 0.7,
  t5: 0.5,
  t6: 0.4,
  t7: 0.3,
};

const TIER_ORDER: SourceTier[] = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];

function scoreConfidence(evidence: EvalEvidence[]): ConfidenceLevel {
  if (evidence.length === 0) return 'low';
  const bestScore = Math.max(...evidence.map((e) => TIER_SCORES[e.tier] ?? 0));
  if (bestScore >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (bestScore >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

function highestTier(evidence: EvalEvidence[]): SourceTier {
  for (const tier of TIER_ORDER) {
    if (evidence.some((e) => e.tier === tier)) return tier;
  }
  return 't7';
}

/**
 * Run retrieval for a single evaluation question.
 * Mirrors the orchestrator's evidence pipeline (T2 + T3 + T4) without LLM.
 */
export async function retrieveForEval(
  context: AiAssistantContext,
  question: string,
): Promise<EvalRetrievalResult> {
  const [t2, t3, t4] = await Promise.all([
    retrieveT2(context, question),
    retrieveT3(context, question),
    retrieveT4(context),
  ]);

  const evidence = [...t2, ...t3, ...t4];

  return {
    evidence,
    confidence: scoreConfidence(evidence),
    sourceTier: highestTier(evidence),
  };
}

// ── T2: Answer Cards ──────────────────────────────────────────────────────────

async function retrieveT2(
  context: AiAssistantContext,
  question: string,
): Promise<EvalEvidence[]> {
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

// ── T3: Answer Memory ─────────────────────────────────────────────────────────

async function retrieveT3(
  context: AiAssistantContext,
  question: string,
): Promise<EvalEvidence[]> {
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

// ── T4: Route + Action Manifests ──────────────────────────────────────────────

async function retrieveT4(context: AiAssistantContext): Promise<EvalEvidence[]> {
  if (!context.route) return [];

  const results: EvalEvidence[] = [];

  const [manifest] = await db
    .select()
    .from(aiSupportRouteManifests)
    .where(eq(aiSupportRouteManifests.route, context.route))
    .limit(1);

  if (manifest) {
    const content = [
      `Page: ${manifest.pageTitle}`,
      `Module: ${manifest.moduleKey}`,
      `Description: ${manifest.description}`,
      manifest.helpText ? `Help: ${manifest.helpText}` : null,
      manifest.tabsJson ? `Tabs: ${JSON.stringify(manifest.tabsJson)}` : null,
      manifest.actionsJson ? `Actions: ${JSON.stringify(manifest.actionsJson)}` : null,
      manifest.permissionsJson
        ? `Permissions: ${JSON.stringify(manifest.permissionsJson)}`
        : null,
      manifest.warningsJson
        ? `Warnings: ${JSON.stringify(manifest.warningsJson)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    results.push({
      tier: 't4',
      source: `route_manifest:${context.route}`,
      content,
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
        action.preconditionsJson
          ? `Preconditions: ${JSON.stringify(action.preconditionsJson)}`
          : null,
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
