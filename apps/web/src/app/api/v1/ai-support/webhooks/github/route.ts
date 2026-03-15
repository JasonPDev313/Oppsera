import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { ingestPR, ingestRelease } from '@oppsera/module-ai-support';
import { invalidateOnCodeChange } from '@oppsera/module-ai-support';

// ── Webhook Signature Verification ───────────────────────────────

/**
 * Verify the GitHub webhook signature using HMAC-SHA256.
 * Header format: "sha256=<hex_digest>"
 */
async function verifyGitHubSignature(
  body: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[github-webhook] GITHUB_WEBHOOK_SECRET is not set');
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const receivedHex = signatureHeader.slice(expectedPrefix.length);
  const hmac = createHmac('sha256', secret);
  hmac.update(body, 'utf8');
  const expectedHex = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (receivedHex.length !== expectedHex.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < receivedHex.length; i++) {
    diff |= receivedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

// ── Payload Types ─────────────────────────────────────────────────

interface GitHubPRPayload {
  action: string;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;
    user: { login: string };
    merged: boolean;
  };
}

interface GitHubReleasePayload {
  action: string;
  release: {
    tag_name: string;
    name: string | null;
    body: string | null;
    published_at: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Fetch the list of changed files for a merged PR from the GitHub API.
 */
async function fetchPRFiles(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<string[]> {
  const githubToken = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
    { headers, signal: AbortSignal.timeout(15_000) },
  );

  if (!response.ok) {
    console.error(`[github-webhook] Failed to fetch PR files: ${response.status}`);
    return [];
  }

  const data = await response.json() as Array<{ filename: string }>;
  return data.map((f) => f.filename);
}

// ── Route Handler ─────────────────────────────────────────────────

/**
 * POST /api/v1/ai-support/webhooks/github
 *
 * Public endpoint (no user auth), protected by HMAC-SHA256 webhook signature.
 * Handles GitHub `pull_request` (merged) and `release` (published) events.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read raw body for signature verification (must happen before any parsing)
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Failed to read request body' } }, { status: 400 });
  }

  // Verify webhook signature
  const signature = request.headers.get('x-hub-signature-256');
  const isValid = await verifyGitHubSignature(rawBody, signature);
  if (!isValid) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature' } },
      { status: 401 },
    );
  }

  // Parse event type
  const eventType = request.headers.get('x-github-event');
  if (!eventType) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing X-GitHub-Event header' } }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON payload' } }, { status: 400 });
  }

  // ── Handle pull_request event (merged only) ──
  if (eventType === 'pull_request') {
    const pr = payload as GitHubPRPayload;

    if (pr.action !== 'closed' || !pr.pull_request.merged) {
      // Not a merge — acknowledge but take no action
      return NextResponse.json({ data: { received: true, action: 'skipped', reason: 'PR not merged' } });
    }

    const prData = pr.pull_request;
    const repoHeader = request.headers.get('x-github-repository') ?? '';
    const [owner = '', repo = ''] = repoHeader.split('/');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing or malformed X-GitHub-Repository header (expected "owner/repo")' } },
        { status: 400 },
      );
    }

    // Fetch changed files
    const changedFiles = await fetchPRFiles(owner, repo, prData.number);

    // Ingest the PR summary — await fully, no fire-and-forget
    const ingestResult = await ingestPR({
      number: prData.number,
      title: prData.title,
      body: prData.body ?? '',
      changedFiles,
      mergedAt: prData.merged_at ?? new Date().toISOString(),
      author: prData.user.login,
    });

    // Invalidate stale answer cards / memory based on changed files
    const sha = prData.merge_commit_sha ?? 'unknown';
    const invalidationResult = await invalidateOnCodeChange(changedFiles, sha);

    return NextResponse.json({
      data: {
        received: true,
        prNumber: prData.number,
        summarized: ingestResult !== null,
        documentId: ingestResult?.documentId ?? null,
        invalidation: {
          answerCardsMarkedStale: invalidationResult.answerCardsMarkedStale,
          answerMemoryMarkedStale: invalidationResult.answerMemoryMarkedStale,
          invalidationRecordsInserted: invalidationResult.invalidationRecordsInserted,
        },
      },
    });
  }

  // ── Handle release event (published only) ──
  if (eventType === 'release') {
    const rel = payload as GitHubReleasePayload;

    if (rel.action !== 'published') {
      return NextResponse.json({ data: { received: true, action: 'skipped', reason: 'Release not published' } });
    }

    const releaseData = rel.release;
    const result = await ingestRelease({
      tag: releaseData.tag_name,
      title: releaseData.name ?? releaseData.tag_name,
      body: releaseData.body ?? '',
      publishedAt: releaseData.published_at,
    });

    return NextResponse.json({
      data: {
        received: true,
        tag: releaseData.tag_name,
        documentId: result.documentId,
      },
    });
  }

  // Unsupported event — acknowledge without error
  return NextResponse.json({
    data: { received: true, action: 'skipped', reason: `Unsupported event: ${eventType}` },
  });
}
