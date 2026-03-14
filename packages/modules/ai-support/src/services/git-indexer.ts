import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { db, aiSupportDocuments } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { sql } from 'drizzle-orm';
import {
  extractRoutes,
  extractPermissions,
  extractActions,
  extractWorkflows,
  type ExtractedRoute,
  type ExtractedPermission,
  type ExtractedAction,
  type ExtractedWorkflow,
} from '../extractors';

// ── Types ────────────────────────────────────────────────────────────

export interface GitIndexerOptions {
  /** Absolute path to the repository root. Defaults to process.cwd(). */
  basePath?: string;
  /** Limit indexing to specific extractor types. Defaults to all. */
  extractors?: Array<'routes' | 'permissions' | 'actions' | 'workflows'>;
  /** If true, force re-index even if SHA matches last run. */
  force?: boolean;
}

export interface GitIndexerResult {
  sha: string;
  indexed: number;
  skipped: number;
  errors: number;
  summary: string;
}

// ── Constants ────────────────────────────────────────────────────────

/**
 * Patterns for files considered indexable support artifacts.
 * (Used for documentation — actual scanning is done by the extractors.)
 */
const INDEXABLE_PATTERNS = [
  'apps/web/src/app/**/page.tsx',
  'apps/web/src/app/**/layout.tsx',
  'apps/web/src/app/api/v1/**/*.ts',
  'packages/modules/*/src/commands/**/*.ts',
  'packages/modules/*/src/queries/**/*.ts',
  'packages/shared/src/permissions/**/*.ts',
] as const;

// Suppress unused warning — patterns are for documentation
void INDEXABLE_PATTERNS;

// ── Redaction ────────────────────────────────────────────────────────

/**
 * Patterns that may contain sensitive data — we strip these from indexed content.
 */
const REDACTION_PATTERNS: RegExp[] = [
  // Environment variable values: process.env.FOO or env.FOO
  /process\.env\.\w+/g,
  // Connection strings: postgres://user:pass@host
  /postgres(?:ql)?:\/\/[^\s'"]+/gi,
  // Generic URLs with credentials: https://user:pass@
  /https?:\/\/[^:@\s]+:[^@\s]+@[^\s'"]+/gi,
  // API keys and secrets (common patterns)
  /(?:api[_-]?key|secret|password|token|bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+]{8,}['"]?/gi,
  // INTERNAL comments
  /\/\/\s*INTERNAL:[^\n]*/g,
  // AWS-style access keys
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
];

function redactContent(content: string): string {
  let redacted = content;
  for (const pattern of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

// ── Git Helpers ──────────────────────────────────────────────────────

/**
 * Get the current git commit SHA. Returns 'unknown' if git is unavailable.
 */
function getCurrentSha(basePath: string): string {
  try {
    const result = execSync('git rev-parse HEAD', {
      cwd: basePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get files changed since a given SHA. Returns null if unable to determine.
 */
function getChangedFiles(basePath: string, sinceSha: string): string[] | null {
  try {
    const result = execSync(`git diff --name-only ${sinceSha} HEAD`, {
      cwd: basePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

// ── Document Builders ────────────────────────────────────────────────

interface DocumentRecord {
  id: string;
  sourceType: string;
  sourceRef: string;
  repoSha: string;
  moduleKey: string | null;
  route: string | null;
  title: string;
  contentMarkdown: string;
  metadataJson: Record<string, unknown>;
}

function buildRouteDocument(route: ExtractedRoute, sha: string): DocumentRecord {
  const content = [
    `# ${route.pageTitle}`,
    '',
    route.description,
    '',
    `**Route:** \`${route.route}\``,
    `**Module:** ${route.moduleKey}`,
  ].join('\n');

  return {
    id: generateUlid(),
    sourceType: 'support_artifact',
    sourceRef: `route:${route.route}`,
    repoSha: sha,
    moduleKey: route.moduleKey,
    route: route.route,
    title: route.pageTitle,
    contentMarkdown: redactContent(content),
    metadataJson: {
      extractorType: 'route',
      filePath: route.filePath,
    },
  };
}

function buildPermissionDocument(perm: ExtractedPermission, sha: string): DocumentRecord {
  const lines = [
    `# API Permission: ${perm.httpMethod} ${perm.route}`,
    '',
    `The \`${perm.httpMethod}\` endpoint at \`${perm.route}\` requires the following access:`,
    '',
  ];

  if (perm.permission) {
    lines.push(`- **Permission:** \`${perm.permission}\``);
  }
  if (perm.entitlement) {
    lines.push(`- **Entitlement:** \`${perm.entitlement}\``);
  }
  lines.push(`- **Write Access:** ${perm.writeAccess ? 'Yes' : 'No'}`);

  return {
    id: generateUlid(),
    sourceType: 'support_artifact',
    sourceRef: `permission:${perm.httpMethod}:${perm.route}`,
    repoSha: sha,
    moduleKey: null,
    route: perm.route,
    title: `API: ${perm.httpMethod} ${perm.route}`,
    contentMarkdown: lines.join('\n'),
    metadataJson: {
      extractorType: 'permission',
      httpMethod: perm.httpMethod,
      permission: perm.permission,
      entitlement: perm.entitlement,
      writeAccess: perm.writeAccess,
    },
  };
}

function buildActionDocument(action: ExtractedAction, sha: string): DocumentRecord {
  const content = [
    `# UI Action: ${action.actionLabel}`,
    '',
    `This action is available in the **${action.moduleKey}** module.`,
    `It is rendered as a \`<${action.contextElement}>\` element with the identifier \`data-ai-action="${action.actionLabel}"\`.`,
    '',
    'Users can interact with this element to trigger the associated functionality.',
  ].join('\n');

  return {
    id: generateUlid(),
    sourceType: 'support_artifact',
    sourceRef: `action:${action.moduleKey}:${action.actionLabel}`,
    repoSha: sha,
    moduleKey: action.moduleKey,
    route: null,
    title: `Action: ${action.actionLabel}`,
    contentMarkdown: content,
    metadataJson: {
      extractorType: 'action',
      contextElement: action.contextElement,
    },
  };
}

function buildWorkflowDocument(workflow: ExtractedWorkflow, sha: string): DocumentRecord {
  const statusList = workflow.statusValues
    .map((s) => `- \`${s}\``)
    .join('\n');

  const content = [
    `# Workflow: ${workflow.entityType} Status Lifecycle`,
    '',
    workflow.description,
    '',
    '## Possible Statuses',
    '',
    statusList,
  ].join('\n');

  return {
    id: generateUlid(),
    sourceType: 'support_artifact',
    sourceRef: `workflow:${workflow.moduleKey}:${workflow.entityType.toLowerCase().replace(/\s+/g, '_')}`,
    repoSha: sha,
    moduleKey: workflow.moduleKey,
    route: null,
    title: `Workflow: ${workflow.entityType}`,
    contentMarkdown: content,
    metadataJson: {
      extractorType: 'workflow',
      statusValues: workflow.statusValues,
    },
  };
}

// ── DB Upsert ────────────────────────────────────────────────────────

/**
 * Upsert a batch of documents into ai_support_documents.
 * Uses ON CONFLICT DO UPDATE by source_ref.
 *
 * Since ai_support_documents has no unique index on source_ref in the schema,
 * we use a SELECT + INSERT/UPDATE pattern per record.
 *
 * All DB ops are awaited (no fire-and-forget).
 */
async function upsertDocuments(docs: DocumentRecord[]): Promise<{ inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;

  for (const doc of docs) {
    // Check if a document with this source_ref already exists
    const existing = await db
      .select({ id: aiSupportDocuments.id })
      .from(aiSupportDocuments)
      .where(sql`${aiSupportDocuments.sourceRef} = ${doc.sourceRef}`)
      .limit(1);

    const now = new Date();

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(aiSupportDocuments)
        .set({
          repoSha: doc.repoSha,
          moduleKey: doc.moduleKey,
          route: doc.route,
          title: doc.title,
          contentMarkdown: doc.contentMarkdown,
          metadataJson: doc.metadataJson,
          indexedAt: now,
          updatedAt: now,
        })
        .where(sql`${aiSupportDocuments.sourceRef} = ${doc.sourceRef}`);
      updated++;
    } else {
      // Insert new record
      await db.insert(aiSupportDocuments).values({
        id: doc.id,
        tenantId: null,
        sourceType: doc.sourceType,
        sourceRef: doc.sourceRef,
        repoSha: doc.repoSha,
        moduleKey: doc.moduleKey,
        route: doc.route,
        title: doc.title,
        contentMarkdown: doc.contentMarkdown,
        metadataJson: doc.metadataJson,
        indexedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      inserted++;
    }
  }

  return { inserted, updated };
}

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Run the git indexer pipeline.
 *
 * Scans the repository for indexable files, extracts support artifacts using
 * all configured extractors, and upserts them into ai_support_documents.
 *
 * Designed for Vercel/serverless: no setInterval, no fire-and-forget, all DB ops awaited,
 * bounded iteration per invocation.
 */
export async function runGitIndexer(options: GitIndexerOptions = {}): Promise<GitIndexerResult> {
  const basePath = options.basePath ?? process.cwd();
  const enabledExtractors = options.extractors ?? ['routes', 'permissions', 'actions', 'workflows'];

  const sha = getCurrentSha(basePath);

  // Check if we have already indexed this SHA (unless force=true)
  if (!options.force && sha !== 'unknown') {
    const existing = await db
      .select({ id: aiSupportDocuments.id })
      .from(aiSupportDocuments)
      .where(sql`${aiSupportDocuments.repoSha} = ${sha} AND ${aiSupportDocuments.sourceType} = 'support_artifact'`)
      .limit(1);

    if (existing.length > 0) {
      return {
        sha,
        indexed: 0,
        skipped: 0,
        errors: 0,
        summary: `Skipped: SHA ${sha.slice(0, 7)} already indexed. Use force=true to re-index.`,
      };
    }
  }

  const documents: DocumentRecord[] = [];
  let errors = 0;

  // ── Route Extractor ──
  if (enabledExtractors.includes('routes')) {
    try {
      const routes = extractRoutes(basePath);
      for (const route of routes) {
        documents.push(buildRouteDocument(route, sha));
      }
    } catch (err) {
      console.error('[git-indexer] Route extractor failed:', err);
      errors++;
    }
  }

  // ── Permission Extractor ──
  if (enabledExtractors.includes('permissions')) {
    try {
      const permissions = extractPermissions(basePath);
      for (const perm of permissions) {
        documents.push(buildPermissionDocument(perm, sha));
      }
    } catch (err) {
      console.error('[git-indexer] Permission extractor failed:', err);
      errors++;
    }
  }

  // ── Action Extractor ──
  if (enabledExtractors.includes('actions')) {
    try {
      const actions = extractActions(basePath);
      // Deduplicate by moduleKey + actionLabel (same action may appear in multiple files)
      const seen = new Set<string>();
      for (const action of actions) {
        const key = `${action.moduleKey}:${action.actionLabel}`;
        if (!seen.has(key)) {
          seen.add(key);
          documents.push(buildActionDocument(action, sha));
        }
      }
    } catch (err) {
      console.error('[git-indexer] Action extractor failed:', err);
      errors++;
    }
  }

  // ── Workflow Extractor ──
  if (enabledExtractors.includes('workflows')) {
    try {
      const workflows = extractWorkflows(basePath);
      for (const workflow of workflows) {
        documents.push(buildWorkflowDocument(workflow, sha));
      }
    } catch (err) {
      console.error('[git-indexer] Workflow extractor failed:', err);
      errors++;
    }
  }

  // ── Upsert to DB ──
  let indexed = 0;
  let skipped = 0;

  if (documents.length > 0) {
    try {
      const { inserted, updated } = await upsertDocuments(documents);
      indexed = inserted + updated;
    } catch (err) {
      console.error('[git-indexer] DB upsert failed:', err);
      errors++;
      skipped = documents.length;
    }
  }

  const summary = [
    `SHA: ${sha.slice(0, 7)}`,
    `Indexed: ${indexed} documents`,
    skipped > 0 ? `Skipped: ${skipped}` : null,
    errors > 0 ? `Errors: ${errors}` : null,
    `Extractors: ${enabledExtractors.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    sha,
    indexed,
    skipped,
    errors,
    summary,
  };
}

/**
 * Get a list of files that changed between two SHAs.
 * Useful for incremental indexing or invalidation.
 */
export function getChangedFilesSince(basePath: string, sinceSha: string): string[] | null {
  return getChangedFiles(basePath, sinceSha);
}
