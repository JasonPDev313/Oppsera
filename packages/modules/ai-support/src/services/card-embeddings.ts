import { eq, and, isNull, sql } from 'drizzle-orm';
import { db, aiSupportAnswerCards } from '@oppsera/db';

// ── Constants ──────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const SUMMARY_MODEL = 'claude-haiku-4-5-20251001';
/** Max cards to embed per batch invocation (Vercel-safe). */
const BATCH_SIZE = 10;

// ── Types ──────────────────────────────────────────────────────────

export interface EmbedCardResult {
  cardId: string;
  embedded: boolean;
  reason?: string;
}

// ── OpenAI Embedding (via fetch) ──────────────────────────────────

/**
 * Generate a vector embedding for the given text using OpenAI's
 * text-embedding-3-small model. Returns a 1536-dimension float array.
 *
 * Uses OPENAI_API_KEY env var. If not set, falls back gracefully.
 */
export async function generateCardEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // text-embedding-3-small context limit
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI Embeddings API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = data.data[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('OpenAI returned unexpected embedding shape');
  }

  return embedding;
}

// ── Summary Generation (via Anthropic Haiku) ──────────────────────

/**
 * Generate a compressed summary of an answer card's content.
 * Used as lower-token evidence when the card is not the top match.
 *
 * Returns a 1-3 sentence summary capturing the key information.
 */
export async function generateCardSummary(
  questionPattern: string,
  answerMarkdown: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Summarize this support answer card in 1-3 sentences. Focus on what the user is asking and the key actionable steps. Return ONLY the summary text, no preamble.

Question patterns: ${questionPattern.slice(0, 500)}

Answer:
${answerMarkdown.slice(0, 3000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
  };

  return (data.content[0]?.text ?? '').trim().slice(0, 500);
}

// ── Single Card Embedding ────────────────────────────────────────

/**
 * Generate embedding + summary for a single answer card and persist to DB.
 *
 * The embedding text combines questionPattern + summary for maximum
 * semantic coverage: the question captures intent, the summary captures
 * the answer's key information.
 */
export async function embedAnswerCard(cardId: string): Promise<EmbedCardResult> {
  try {
    const [card] = await db
      .select({
        id: aiSupportAnswerCards.id,
        questionPattern: aiSupportAnswerCards.questionPattern,
        approvedAnswerMarkdown: aiSupportAnswerCards.approvedAnswerMarkdown,
        summary: aiSupportAnswerCards.summary,
      })
      .from(aiSupportAnswerCards)
      .where(eq(aiSupportAnswerCards.id, cardId))
      .limit(1);

    if (!card) {
      return { cardId, embedded: false, reason: 'card not found' };
    }

    // Generate summary if missing
    let summary = card.summary;
    if (!summary) {
      summary = await generateCardSummary(card.questionPattern, card.approvedAnswerMarkdown);
    }

    // Embed: questionPattern + summary gives best semantic coverage
    const textToEmbed = `${card.questionPattern}\n\n${summary}`;
    const embedding = await generateCardEmbedding(textToEmbed);

    // Persist embedding + summary
    await db.execute(
      sql`UPDATE ai_support_answer_cards
          SET embedding = ${`[${embedding.join(',')}]`}::vector,
              summary = ${summary},
              updated_at = now()
          WHERE id = ${cardId}`,
    );

    return { cardId, embedded: true };
  } catch (err) {
    console.error(`[card-embeddings] Failed to embed card ${cardId}:`, err);
    return { cardId, embedded: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}

// ── Batch Embedding Pipeline ─────────────────────────────────────

/**
 * Find active answer cards without embeddings and generate them in batches.
 * Safe for Vercel: processes at most BATCH_SIZE cards per invocation.
 *
 * Returns the number of cards successfully embedded.
 */
export async function embedPendingAnswerCards(): Promise<number> {
  const pending = await db
    .select({
      id: aiSupportAnswerCards.id,
    })
    .from(aiSupportAnswerCards)
    .where(
      and(
        eq(aiSupportAnswerCards.status, 'active'),
        isNull(aiSupportAnswerCards.embedding),
      ),
    )
    .limit(BATCH_SIZE);

  if (pending.length === 0) return 0;

  let embedded = 0;

  for (const card of pending) {
    const result = await embedAnswerCard(card.id);
    if (result.embedded) embedded++;
  }

  console.log(`[card-embeddings] Embedded ${embedded}/${pending.length} pending cards`);
  return embedded;
}

// ── Vector Search ────────────────────────────────────────────────

export interface VectorSearchResult {
  id: string;
  slug: string;
  questionPattern: string;
  approvedAnswerMarkdown: string;
  summary: string | null;
  moduleKey: string | null;
  route: string | null;
  similarity: number;
}

/**
 * Search answer cards by vector similarity using pgvector cosine distance.
 *
 * 1. Embeds the query text via OpenAI
 * 2. Runs ORDER BY embedding <=> query_vector on active cards with HNSW index
 * 3. Returns top-k results with similarity scores
 *
 * Filters by moduleKey (if provided) and includes global cards (null moduleKey).
 * Route prefix matching is applied in the caller (retrieval.ts).
 */
export async function vectorSearchAnswerCards(
  queryText: string,
  moduleKey: string | undefined,
  limit = 10,
): Promise<VectorSearchResult[]> {
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateCardEmbedding(queryText);
  } catch (err) {
    console.warn('[card-embeddings] Query embedding failed, skipping vector search:', err);
    return [];
  }

  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  // Build WHERE clause
  const conditions = [
    sql`status = 'active'`,
    sql`embedding IS NOT NULL`,
  ];
  if (moduleKey) {
    conditions.push(sql`(module_key = ${moduleKey} OR module_key IS NULL)`);
  }

  const rows = await db.execute<{
    id: string;
    slug: string;
    question_pattern: string;
    approved_answer_markdown: string;
    summary: string | null;
    module_key: string | null;
    route: string | null;
    similarity: number;
  }>(
    sql`
      SELECT
        id, slug, question_pattern, approved_answer_markdown,
        summary, module_key, route,
        1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM ai_support_answer_cards
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `,
  );

  return Array.from(rows as Iterable<typeof rows extends Iterable<infer U> ? U : never>).map((row) => ({
    id: row.id,
    slug: row.slug,
    questionPattern: row.question_pattern,
    approvedAnswerMarkdown: row.approved_answer_markdown,
    summary: row.summary,
    moduleKey: row.module_key,
    route: row.route,
    similarity: Number(row.similarity),
  }));
}
