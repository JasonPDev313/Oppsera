import { db, aiSupportDocuments } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { sql } from 'drizzle-orm';
import { FAST_MODEL_ID } from '../constants';

// ── Types ────────────────────────────────────────────────────────────

export interface PRData {
  number: number;
  title: string;
  body: string;
  changedFiles: string[];
  mergedAt: string;
  author: string;
}

export interface ReleaseData {
  tag: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface PRSummaryResult {
  summary: string;
  documentId: string;
}

export interface ReleaseIngestResult {
  documentId: string;
}

// ── Claude API Call ───────────────────────────────────────────────

/**
 * Call the Anthropic Messages API using fetch (non-streaming).
 * Mirrors the pattern used in orchestrator.ts.
 */
async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: FAST_MODEL_ID,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage.slice(0, 8000) }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody.slice(0, 500)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };
  const textBlock = data.content.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}

// ── PR Summarizer ────────────────────────────────────────────────

const PR_SYSTEM_PROMPT = `You are a technical writer creating customer-facing release notes for OppsEra, a multi-tenant SaaS ERP for SMBs (retail, restaurant, golf, hybrid).

Your job: Given a pull request title, description, and changed files, write a customer-visible summary of the change.

Rules:
- Focus ONLY on customer-visible changes (new features, bug fixes that affect users, UI changes, workflow changes).
- Describe changes in plain business language — NOT technical terms, code names, or file paths.
- Completely IGNORE: internal refactors, test file changes, build config changes, linting, type fixes, migration files, documentation updates.
- If there are NO customer-visible changes, respond with exactly: NO_USER_IMPACT
- Output 1–3 sentences maximum per significant change.
- Do NOT use markdown headings or bullet points. Write in plain prose.`;

/**
 * Generate a customer-visible summary of a pull request using Claude.
 * Returns null if the PR has no user-facing impact.
 */
export async function summarizePR(prData: PRData): Promise<string | null> {
  const userMessage = [
    `PR #${prData.number}: ${prData.title}`,
    '',
    prData.body ? `Description:\n${prData.body.slice(0, 4000)}` : 'No description provided.',
    '',
    `Changed files (${prData.changedFiles.length}):`,
    prData.changedFiles.slice(0, 50).join('\n'),
    prData.changedFiles.length > 50
      ? `... and ${prData.changedFiles.length - 50} more files`
      : '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  const summary = await callClaude(PR_SYSTEM_PROMPT, userMessage);
  const trimmed = summary.trim();

  if (trimmed === 'NO_USER_IMPACT' || trimmed === '') {
    return null;
  }

  return trimmed;
}

// ── Document Upsert Helper ────────────────────────────────────────

async function upsertDocument(
  sourceRef: string,
  fields: {
    sourceType: string;
    title: string;
    contentMarkdown: string;
    metadataJson: Record<string, unknown>;
    repoSha?: string | null;
    moduleKey?: string | null;
    route?: string | null;
  },
): Promise<string> {
  const now = new Date();

  const existing = await db
    .select({ id: aiSupportDocuments.id })
    .from(aiSupportDocuments)
    .where(sql`${aiSupportDocuments.sourceRef} = ${sourceRef}`)
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    await db
      .update(aiSupportDocuments)
      .set({
        title: fields.title,
        contentMarkdown: fields.contentMarkdown,
        metadataJson: fields.metadataJson,
        repoSha: fields.repoSha ?? null,
        indexedAt: now,
        updatedAt: now,
      })
      .where(sql`${aiSupportDocuments.sourceRef} = ${sourceRef}`);
    return existing[0].id;
  }

  const id = generateUlid();
  await db.insert(aiSupportDocuments).values({
    id,
    tenantId: null,
    sourceType: fields.sourceType,
    sourceRef,
    repoSha: fields.repoSha ?? null,
    moduleKey: fields.moduleKey ?? null,
    route: fields.route ?? null,
    title: fields.title,
    contentMarkdown: fields.contentMarkdown,
    metadataJson: fields.metadataJson,
    indexedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

// ── Ingest Functions ─────────────────────────────────────────────

/**
 * Summarize a merged PR and store it as a pr_summary document.
 * Skips ingestion if the PR has no customer-visible changes.
 */
export async function ingestPR(prData: PRData): Promise<PRSummaryResult | null> {
  const summary = await summarizePR(prData);

  if (!summary) {
    return null;
  }

  const sourceRef = `pr:${prData.number}`;
  const contentMarkdown = [
    `# PR #${prData.number}: ${prData.title}`,
    '',
    summary,
    '',
    `*Merged by ${prData.author} on ${new Date(prData.mergedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`,
  ].join('\n');

  const documentId = await upsertDocument(sourceRef, {
    sourceType: 'pr_summary',
    title: `PR #${prData.number}: ${prData.title}`,
    contentMarkdown,
    metadataJson: {
      prNumber: prData.number,
      author: prData.author,
      mergedAt: prData.mergedAt,
      changedFilesCount: prData.changedFiles.length,
    },
  });

  return { summary, documentId };
}

/**
 * Store a GitHub release note as a release_note document.
 */
export async function ingestRelease(releaseData: ReleaseData): Promise<ReleaseIngestResult> {
  const sourceRef = `release:${releaseData.tag}`;
  const contentMarkdown = [
    `# ${releaseData.title || releaseData.tag}`,
    '',
    releaseData.body || '*No release notes provided.*',
    '',
    `*Published on ${new Date(releaseData.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`,
  ].join('\n');

  const documentId = await upsertDocument(sourceRef, {
    sourceType: 'release_note',
    title: releaseData.title || `Release ${releaseData.tag}`,
    contentMarkdown,
    metadataJson: {
      tag: releaseData.tag,
      publishedAt: releaseData.publishedAt,
    },
  });

  return { documentId };
}
