import { NextResponse } from 'next/server';
import { runGitIndexer, embedDocuments, embedPendingAnswerCards } from '@oppsera/module-ai-support';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Vercel Cron — AI knowledge base reindex.
 *
 * 1. Runs the git indexer to extract routes/permissions/actions/workflows
 *    from the codebase into ai_support_documents.
 * 2. Runs the keyword embedding pipeline so new documents become searchable.
 *
 * Schedule: daily at 3:30 AM UTC (via vercel.json).
 * Can also be triggered manually via curl with CRON_SECRET.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // Step 1: Git indexer — extract code artifacts into ai_support_documents
  try {
    const indexResult = await runGitIndexer({
      basePath: process.cwd(),
      force: false,
    });
    results.indexer = {
      sha: indexResult.sha,
      indexed: indexResult.indexed,
      skipped: indexResult.skipped,
      errors: indexResult.errors,
    };
  } catch (err) {
    console.error('[ai-reindex-cron] Git indexer failed:', err);
    results.indexer = { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  // Step 2: Keyword embedding — generate keyword indexes for unindexed documents.
  // Each call processes up to 20 docs. Loop until drained or 40s elapsed
  // (leaving 20s buffer for the indexer + response).
  const embedStart = Date.now();
  const EMBED_TIME_BUDGET_MS = 40_000;
  let totalEmbedded = 0;
  while (Date.now() - embedStart < EMBED_TIME_BUDGET_MS) {
    try {
      const batch = await embedDocuments();
      totalEmbedded += batch;
      if (batch === 0) break; // No more pending docs
    } catch (batchErr) {
      console.error('[ai-reindex-cron] Embedding batch failed, continuing:', batchErr);
      break; // Don't retry failed batch — let next cron invocation pick it up
    }
  }
  results.embedded = totalEmbedded;

  // Step 3: Answer card embeddings — backfill cards missing vector embeddings.
  // Processes up to 10 per batch, loop until drained or 15s budget.
  const cardEmbedStart = Date.now();
  const CARD_EMBED_TIME_BUDGET_MS = 15_000;
  let totalCardEmbedded = 0;
  while (Date.now() - cardEmbedStart < CARD_EMBED_TIME_BUDGET_MS) {
    try {
      const batch = await embedPendingAnswerCards();
      totalCardEmbedded += batch;
      if (batch === 0) break;
    } catch (batchErr) {
      console.error('[ai-reindex-cron] Card embedding batch failed:', batchErr);
      break;
    }
  }
  results.cardEmbedded = totalCardEmbedded;

  return NextResponse.json({ status: 'ok', ...results });
}
