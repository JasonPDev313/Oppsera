import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { runGitIndexer } from '@oppsera/module-ai-support';

// POST /api/v1/ai-support/index — trigger a full re-index of the repository
//
// Protected by admin permission. Can also be called with an internal CRON_SECRET
// header for cron-triggered reindexing without user auth.
export const POST = withMiddleware(
  async (request: NextRequest) => {
    // Allow cron-triggered calls via internal key (bypasses user auth check)
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;
    const isInternalCall = expectedSecret && cronSecret === expectedSecret;

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

    return NextResponse.json(
      {
        data: {
          sha: result.sha,
          indexed: result.indexed,
          skipped: result.skipped,
          errors: result.errors,
          summary: result.summary,
          triggeredBy: isInternalCall ? 'cron' : 'admin',
        },
      },
      { status: 200 },
    );
  },
  { permission: 'ai_support.admin', writeAccess: true },
);
