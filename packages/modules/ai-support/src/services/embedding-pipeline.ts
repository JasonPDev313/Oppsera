import { db, aiSupportDocuments, aiSupportEmbeddingsMeta, sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── Constants ──────────────────────────────────────────────────────

const INDEX_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;

// ── Types ──────────────────────────────────────────────────────────

export interface SemanticSearchResult {
  id: string;
  title: string | null;
  contentMarkdown: string | null;
  moduleKey: string | null;
  route: string | null;
  sourceType: string;
  score: number;
}

interface KeywordIndex {
  keywords: string[];
  summary: string;
}

// ── Keyword Extraction via Anthropic ─────────────────────────────

/**
 * Use Claude (Haiku) to extract searchable keywords and a short summary
 * from a support document. This replaces vector embeddings — we store
 * structured keyword indexes and match against them with text search.
 *
 * Uses ANTHROPIC_API_KEY — no OpenAI dependency needed.
 */
export async function generateEmbedding(text: string): Promise<KeywordIndex> {
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
    body: JSON.stringify({
      model: INDEX_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Extract searchable keywords and a one-sentence summary from this support document.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"keywords": ["keyword1", "keyword2", ...], "summary": "One sentence summary"}

Rules:
- Extract 10-20 keywords that a user might search for
- Include: feature names, action verbs, business concepts, screen names, common questions
- Exclude: articles, prepositions, generic words like "the", "is", "and"
- Summary should describe what this document helps with

Document:
${text.slice(0, 4000)}`,
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

  const responseText = data.content[0]?.text ?? '{}';

  try {
    const parsed = JSON.parse(responseText) as KeywordIndex;
    if (!Array.isArray(parsed.keywords)) parsed.keywords = [];
    if (typeof parsed.summary !== 'string') parsed.summary = '';
    return parsed;
  } catch {
    // If Claude returns malformed JSON, extract what we can
    return {
      keywords: text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
        .slice(0, 15),
      summary: text.slice(0, 200),
    };
  }
}

// ── Batch Indexing Pipeline ───────────────────────────────────────

/**
 * Find all support documents that do not yet have a keyword index
 * and generate one for them in batches of BATCH_SIZE.
 *
 * The keyword index is stored as JSON in the metadata_json column
 * under a `keywordIndex` key. The embedding column is set to a
 * placeholder so we can track which docs have been indexed.
 *
 * Safe for Vercel: iterates one batch per invocation.
 */
export async function embedDocuments(): Promise<number> {
  // Find documents not yet keyword-indexed (metadata_json missing keywordIndex)
  const pending = await db
    .select({
      id: aiSupportDocuments.id,
      title: aiSupportDocuments.title,
      contentMarkdown: aiSupportDocuments.contentMarkdown,
      metadataJson: aiSupportDocuments.metadataJson,
    })
    .from(aiSupportDocuments)
    .where(sql`metadata_json IS NULL OR metadata_json->>'keywordIndex' IS NULL`)
    .limit(BATCH_SIZE);

  if (pending.length === 0) return 0;

  let indexed = 0;

  for (const doc of pending) {
    const textToIndex = [doc.title ?? '', doc.contentMarkdown ?? '']
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (!textToIndex) continue;

    try {
      const keywordIndex = await generateEmbedding(textToIndex);

      // Merge keyword index into existing metadata
      const existingMeta = (doc.metadataJson as Record<string, unknown>) ?? {};
      const updatedMeta = {
        ...existingMeta,
        keywordIndex: keywordIndex.keywords,
        keywordSummary: keywordIndex.summary,
        indexedWith: INDEX_MODEL,
      };

      // Update metadata and set indexed_at to mark as indexed.
      // The embedding column stays NULL — we use keyword-based indexing, not vectors.
      await db.execute(
        sql`UPDATE ai_support_documents
            SET metadata_json = ${JSON.stringify(updatedMeta)}::jsonb,
                indexed_at = now(),
                updated_at = now()
            WHERE id = ${doc.id}`,
      );

      // Record metadata
      await db.insert(aiSupportEmbeddingsMeta).values({
        id: generateUlid(),
        documentId: doc.id,
        modelName: INDEX_MODEL,
        dimensions: 0, // keyword-based, not vector
      });

      indexed++;
    } catch (err) {
      console.error(`[embedding-pipeline] Failed to index doc ${doc.id}:`, err);
    }
  }

  return indexed;
}

// ── Semantic Search (Keyword-based) ──────────────────────────────

/**
 * Search support documents using keyword matching against the
 * keyword index stored in metadata_json.
 *
 * Scoring: percentage of query words that match stored keywords.
 * No external API call needed at search time — all matching is local.
 */
export async function semanticSearch(
  query: string,
  moduleKey?: string,
  limit = 5,
): Promise<SemanticSearchResult[]> {
  // Extract search terms from the query
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (queryTerms.length === 0) return [];

  // Build conditions — filter to keyword-indexed docs
  const conditions = [sql`metadata_json->>'keywordIndex' IS NOT NULL`];
  if (moduleKey) {
    conditions.push(sql`module_key = ${moduleKey}`);
  }

  // Fetch indexed documents — use ILIKE to pre-filter for at least one keyword match
  // This avoids loading every document into memory
  const orClauses = queryTerms
    .slice(0, 5) // limit to top 5 terms to avoid huge queries
    .map((term) => sql`metadata_json::text ILIKE ${'%' + term + '%'}`);

  const preFilter = orClauses.length > 0
    ? sql`(${sql.join(orClauses, sql` OR `)})`
    : sql`TRUE`;

  const rows = await db.execute<{
    id: string;
    title: string | null;
    content_markdown: string | null;
    module_key: string | null;
    route: string | null;
    source_type: string;
    metadata_json: string | null;
  }>(
    sql`
      SELECT id, title, content_markdown, module_key, route, source_type, metadata_json::text
      FROM ai_support_documents
      WHERE ${sql.join(conditions, sql` AND `)}
        AND ${preFilter}
      LIMIT ${limit * 3}
    `,
  );

  // Score each result by keyword overlap
  const scored: SemanticSearchResult[] = [];

  for (const row of Array.from(rows as Iterable<typeof rows extends Iterable<infer U> ? U : never>)) {
    let keywords: string[] = [];
    let summary = '';

    try {
      const meta = typeof row.metadata_json === 'string'
        ? JSON.parse(row.metadata_json)
        : row.metadata_json;
      keywords = (meta?.keywordIndex as string[]) ?? [];
      summary = (meta?.keywordSummary as string) ?? '';
    } catch { /* skip malformed metadata */ }

    // Score: fraction of query terms found in keywords + summary
    const searchableText = [...keywords, summary].join(' ').toLowerCase();
    const matchedTerms = queryTerms.filter((term) => searchableText.includes(term));
    const score = matchedTerms.length / queryTerms.length;

    if (score > 0) {
      scored.push({
        id: row.id,
        title: row.title,
        contentMarkdown: row.content_markdown,
        moduleKey: row.module_key,
        route: row.route,
        sourceType: row.source_type,
        score,
      });
    }
  }

  // Sort by score descending, return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
