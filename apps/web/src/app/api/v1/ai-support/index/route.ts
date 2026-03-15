import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { runGitIndexer, embedDocuments } from '@oppsera/module-ai-support';

// POST /api/v1/ai-support/index — trigger a full re-index of the repository
//
// Protected by admin permission. For automated reindexing, use the cron at
// /api/v1/ai-support/cron/reindex (CRON_SECRET auth, no user session needed).
export const POST = withMiddleware(
  async (request: NextRequest) => {
    // Parse optional body options
    let body: {
      force?: boolean;
      extractors?: Array<'routes' | 'permissions' | 'actions' | 'workflows'>;
    } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine — use defaults
    }

    const basePath = process.cwd();

    const result = await runGitIndexer({
      basePath,
      force: body.force ?? false,
      extractors: body.extractors,
    });

    // After indexing, run the keyword embedding pipeline so new documents
    // become searchable immediately (processes up to 20 per call).
    let embedded = 0;
    try {
      embedded = await embedDocuments();
    } catch (embedErr) {
      console.warn('[ai-support/index] Embedding pipeline failed:', embedErr);
    }

    return NextResponse.json(
      {
        data: {
          sha: result.sha,
          indexed: result.indexed,
          skipped: result.skipped,
          errors: result.errors,
          embedded,
          summary: result.summary,
          triggeredBy: 'admin',
        },
      },
      { status: 200 },
    );
  },
  { permission: 'ai_support.admin', writeAccess: true },
);
