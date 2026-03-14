import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ingestPR, ingestRelease } from '@oppsera/module-ai-support';
import { invalidateOnCodeChange } from '@oppsera/module-ai-support';

// ── GitHub API Helpers ────────────────────────────────────────────

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function fetchPRData(owner: string, repo: string, prNumber: number) {
  const [prResponse, filesResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
      headers: githubHeaders(),
    }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, {
      headers: githubHeaders(),
    }),
  ]);

  if (!prResponse.ok) {
    const body = await prResponse.text();
    throw new Error(`GitHub API error fetching PR: ${prResponse.status} ${body}`);
  }
  if (!filesResponse.ok) {
    const body = await filesResponse.text();
    throw new Error(`GitHub API error fetching PR files: ${filesResponse.status} ${body}`);
  }

  const prData = await prResponse.json() as {
    number: number;
    title: string;
    body: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;
    merged: boolean;
    user: { login: string };
  };

  const filesData = await filesResponse.json() as Array<{ filename: string }>;
  const changedFiles = filesData.map((f) => f.filename);

  return { prData, changedFiles };
}

async function fetchReleaseData(owner: string, repo: string, tag: string) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: githubHeaders() },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error fetching release: ${response.status} ${body}`);
  }

  return response.json() as Promise<{
    tag_name: string;
    name: string | null;
    body: string | null;
    published_at: string;
  }>;
}

// ── Route Handler ─────────────────────────────────────────────────

/**
 * POST /api/v1/ai-support/pr-ingest
 *
 * Admin-triggered manual PR or release ingestion.
 *
 * Body options:
 *   For a PR:      { owner: string, repo: string, prNumber: number }
 *   For a release: { owner: string, repo: string, tag: string }
 */
export const POST = withMiddleware(
  async (request: NextRequest) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Request body must be an object' } },
        { status: 400 },
      );
    }

    const { owner, repo, prNumber, tag } = body as {
      owner?: unknown;
      repo?: unknown;
      prNumber?: unknown;
      tag?: unknown;
    };

    if (typeof owner !== 'string' || typeof repo !== 'string') {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Fields "owner" and "repo" are required strings' } },
        { status: 400 },
      );
    }

    // ── PR ingestion path ──
    if (prNumber !== undefined) {
      const prNum = typeof prNumber === 'string' ? parseInt(prNumber, 10) : prNumber;
      if (typeof prNum !== 'number' || isNaN(prNum) || prNum <= 0) {
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: '"prNumber" must be a positive integer' } },
          { status: 400 },
        );
      }

      const { prData, changedFiles } = await fetchPRData(owner, repo, prNum);

      if (!prData.merged) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: `PR #${prNum} has not been merged` } },
          { status: 422 },
        );
      }

      const ingestResult = await ingestPR({
        number: prData.number,
        title: prData.title,
        body: prData.body ?? '',
        changedFiles,
        mergedAt: prData.merged_at ?? new Date().toISOString(),
        author: prData.user.login,
      });

      const sha = prData.merge_commit_sha ?? 'unknown';
      const invalidationResult = await invalidateOnCodeChange(changedFiles, sha);

      return NextResponse.json({
        data: {
          type: 'pr',
          prNumber: prData.number,
          summarized: ingestResult !== null,
          documentId: ingestResult?.documentId ?? null,
          summary: ingestResult?.summary ?? null,
          invalidation: {
            answerCardsMarkedStale: invalidationResult.answerCardsMarkedStale,
            answerMemoryMarkedStale: invalidationResult.answerMemoryMarkedStale,
            invalidationRecordsInserted: invalidationResult.invalidationRecordsInserted,
          },
        },
      });
    }

    // ── Release ingestion path ──
    if (tag !== undefined) {
      if (typeof tag !== 'string' || tag.trim() === '') {
        return NextResponse.json(
          { error: { code: 'BAD_REQUEST', message: '"tag" must be a non-empty string' } },
          { status: 400 },
        );
      }

      const releaseData = await fetchReleaseData(owner, repo, tag);

      const ingestResult = await ingestRelease({
        tag: releaseData.tag_name,
        title: releaseData.name ?? releaseData.tag_name,
        body: releaseData.body ?? '',
        publishedAt: releaseData.published_at,
      });

      return NextResponse.json({
        data: {
          type: 'release',
          tag: releaseData.tag_name,
          documentId: ingestResult.documentId,
        },
      });
    }

    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Provide either "prNumber" (for a PR) or "tag" (for a release)' } },
      { status: 400 },
    );
  },
  { permission: 'ai_support.admin', writeAccess: true },
);
