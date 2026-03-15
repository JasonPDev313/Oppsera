import { db } from '@oppsera/db';
import { sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── Types ───────────────────────────────────────────────────────────

export interface FeatureGapInput {
  tenantId: string;
  question: string;
  confidence: 'high' | 'medium' | 'low';
  sourceTier: string;
  moduleKey?: string | null;
  route?: string | null;
  threadId?: string | null;
  /** 0 = first message, >0 = follow-up (skip gap detection for follow-ups) */
  messageIndex: number;
}

export interface FeatureGapResult {
  recorded: boolean;
  isNew: boolean;
  occurrenceCount: number;
  reason?: string;
}

// ── Stop words for normalization ──────────────────────────────────

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'a', 'an', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
  'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
  'such', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
  'then', 'once', 'if', 'when', 'where', 'why', 'how', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its',
]);

// ── Normalization ─────────────────────────────────────────────────

/**
 * Normalize a question for clustering/dedup:
 * - lowercase
 * - strip punctuation
 * - remove stop words
 * - sort remaining words alphabetically
 * - join with spaces
 *
 * This groups semantically similar questions together
 * (e.g., "How do I create a walk-in?" and "How to create a walk in appointment?" → same hash)
 */
function normalizeQuestion(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .sort();

  // Deduplicate consecutive identical words
  const unique = words.filter((w, i) => i === 0 || w !== words[i - 1]);
  return unique.join(' ');
}

/**
 * Simple hash using Web Crypto API (SHA-256).
 * Returns a hex string.
 */
async function hashQuestion(normalized: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Escalation phrase detection ───────────────────────────────────

const ESCALATION_PHRASES = [
  'reaching out to your system administrator',
  'contact support',
  'contact your administrator',
  "i'm not sure how to help with that",
  "i don't have enough information",
];

// ── Main Detection Function ───────────────────────────────────────

/**
 * Detects and records feature gaps — questions the AI couldn't answer well.
 *
 * Called from wrapStreamWithPersistence after the answer is collected.
 * Only records gaps for:
 * - First message in a thread (messageIndex === 0)
 * - Low confidence OR no curated evidence (t5+ only)
 * - Question length > 10 chars (skip trivial inputs)
 *
 * Uses upsert on question_hash for dedup — increments occurrence_count
 * on repeat questions rather than creating duplicates.
 */
export async function maybeRecordFeatureGap(
  input: FeatureGapInput,
  answerText?: string,
): Promise<FeatureGapResult> {
  // ── Guard: only first message in thread ──
  if (input.messageIndex > 0) {
    return { recorded: false, isNew: false, occurrenceCount: 0, reason: 'follow-up message' };
  }

  // ── Guard: skip trivial questions ──
  if (input.question.trim().length <= 10) {
    return { recorded: false, isNew: false, occurrenceCount: 0, reason: 'question too short' };
  }

  // ── Guard: only low confidence or low-tier answers ──
  const isLowConfidence = input.confidence === 'low';
  const isLowTier = ['t5', 't6', 't7'].includes(input.sourceTier);
  const hasEscalation = answerText
    ? ESCALATION_PHRASES.some((phrase) => answerText.toLowerCase().includes(phrase))
    : false;

  if (!isLowConfidence && !isLowTier && !hasEscalation) {
    return { recorded: false, isNew: false, occurrenceCount: 0, reason: 'adequate answer' };
  }

  // ── Normalize and hash ──
  const normalized = normalizeQuestion(input.question);
  if (!normalized || normalized.length < 3) {
    return { recorded: false, isNew: false, occurrenceCount: 0, reason: 'empty after normalization' };
  }

  const questionHash = await hashQuestion(normalized);
  const tenantCoalesce = input.tenantId || '__global__';

  // ── Upsert: increment count if exists, insert if new ──
  // Use raw SQL for the upsert with the unique index on (tenant_id_coalesced, question_hash)
  const result = await db.execute(sql`
    INSERT INTO ai_support_feature_gaps (
      id, tenant_id, question_normalized, question_hash,
      module_key, route, occurrence_count,
      first_seen_at, last_seen_at,
      sample_question, sample_thread_id, sample_confidence,
      status, priority,
      created_at, updated_at
    ) VALUES (
      ${generateUlid()}, ${input.tenantId}, ${normalized}, ${questionHash},
      ${input.moduleKey ?? null}, ${input.route ?? null}, 1,
      NOW(), NOW(),
      ${input.question.slice(0, 500)}, ${input.threadId ?? null}, ${input.confidence},
      'open', 'medium',
      NOW(), NOW()
    )
    ON CONFLICT (COALESCE(tenant_id, '__global__'), question_hash) DO UPDATE SET
      occurrence_count = ai_support_feature_gaps.occurrence_count + 1,
      last_seen_at = NOW(),
      sample_question = EXCLUDED.sample_question,
      sample_thread_id = EXCLUDED.sample_thread_id,
      sample_confidence = EXCLUDED.sample_confidence,
      module_key = COALESCE(EXCLUDED.module_key, ai_support_feature_gaps.module_key),
      route = COALESCE(EXCLUDED.route, ai_support_feature_gaps.route),
      updated_at = NOW()
    RETURNING occurrence_count::int AS occ_count
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const occurrenceCount = Number(rows[0]?.occ_count ?? 1);
  const isNew = occurrenceCount === 1;

  // ── Auto-promote priority based on frequency ──
  if (occurrenceCount >= 20) {
    await db.execute(sql`
      UPDATE ai_support_feature_gaps
      SET priority = 'critical', updated_at = NOW()
      WHERE question_hash = ${questionHash}
        AND COALESCE(tenant_id, '__global__') = ${tenantCoalesce}
        AND priority != 'critical'
    `);
  } else if (occurrenceCount >= 10) {
    await db.execute(sql`
      UPDATE ai_support_feature_gaps
      SET priority = 'high', updated_at = NOW()
      WHERE question_hash = ${questionHash}
        AND COALESCE(tenant_id, '__global__') = ${tenantCoalesce}
        AND priority NOT IN ('critical', 'high')
    `);
  }

  return { recorded: true, isNew, occurrenceCount };
}
