import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

export interface ExtractedWorkflow {
  entityType: string;
  statusValues: string[];
  description: string;
  moduleKey: string;
  filePath: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Recursively collect .ts and .tsx files under a directory.
 */
function collectTsFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, results);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Derive module key from file path.
 */
function deriveModuleKey(filePath: string, basePath: string): string {
  const rel = path.relative(basePath, filePath).replace(/\\/g, '/');
  // packages/modules/<module>/...
  const modMatch = rel.match(/packages\/modules\/([^/]+)\//);
  if (modMatch?.[1]) return modMatch[1].replace(/-/g, '_');
  // packages/shared/...
  if (rel.includes('packages/shared')) return 'shared';
  // apps/web/...
  const appMatch = rel.match(/apps\/web\/src\/(?:app|components)\/([^/[(]+)\//);
  if (appMatch?.[1]) return appMatch[1];
  return 'platform';
}

/**
 * Convert a SCREAMING_SNAKE_CASE or snake_case status value to a human-readable label.
 * e.g. "IN_PROGRESS" → "In Progress", "draft" → "Draft"
 */
function humanizeStatus(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Infer the entity type from the constant name.
 * e.g. "ORDER_STATUSES" → "Order", "APPOINTMENT_STATUS_VALUES" → "Appointment"
 */
function inferEntityType(constName: string): string {
  // Strip common suffixes
  const stripped = constName
    .replace(/_STATUSES?$/, '')
    .replace(/_STATUS_VALUES?$/, '')
    .replace(/_STATES?$/, '')
    .replace(/_STATUS$/, '');

  return stripped
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a business-language workflow description.
 */
function buildWorkflowDescription(entityType: string, statusValues: string[]): string {
  const humanStatuses = statusValues.map(humanizeStatus);

  if (humanStatuses.length === 0) return `${entityType} workflow.`;
  if (humanStatuses.length === 1) return `${entityType} has a single status: ${humanStatuses[0] ?? ''}.`;

  const lastStatus = humanStatuses[humanStatuses.length - 1] ?? '';
  const intermediateStatuses = humanStatuses.slice(0, -1);

  return (
    `${entityType} lifecycle: progresses through states — ` +
    `${intermediateStatuses.join(', ')} → ${lastStatus}. ` +
    `Staff can view and filter ${entityType.toLowerCase()} records by these statuses.`
  );
}

/**
 * Parse a file for status/state enum definitions.
 *
 * Patterns detected:
 * 1. `const ORDER_STATUSES = ['draft', 'pending', 'confirmed'] as const`
 * 2. `const ORDER_STATUSES = { DRAFT: 'draft', PENDING: 'pending' } as const`
 * 3. `enum OrderStatus { Draft = 'draft', Pending = 'pending' }`
 * 4. `const ORDER_STATUSES = ['draft', ...]` (without `as const`)
 */
function extractWorkflowsFromContent(
  content: string,
  filePath: string,
  basePath: string,
): ExtractedWorkflow[] {
  const results: ExtractedWorkflow[] = [];
  const moduleKey = deriveModuleKey(filePath, basePath);

  // Pattern 1 & 4: const X_STATUSES = [...] or const X_STATUS_VALUES = [...]
  const arrayConstRe =
    /const\s+([A-Z][A-Z0-9_]*(?:STATUSE?S?|STATUS_VALUES?|STATES?))\s*=\s*\[([^\]]+)\]/g;

  let match: RegExpExecArray | null;
  while ((match = arrayConstRe.exec(content)) !== null) {
    const constName = match[1];
    const arrayBody = match[2];
    if (!constName || !arrayBody) continue;

    // Extract string values from the array
    const valueRe = /['"`]([^'"`]+)['"`]/g;
    const statusValues: string[] = [];
    let vm: RegExpExecArray | null;
    while ((vm = valueRe.exec(arrayBody)) !== null) {
      if (vm[1]) statusValues.push(vm[1]);
    }

    if (statusValues.length < 2) continue;

    const entityType = inferEntityType(constName);
    results.push({
      entityType,
      statusValues,
      description: buildWorkflowDescription(entityType, statusValues),
      moduleKey,
      filePath,
    });
  }

  // Pattern 2: const X_STATUSES = { KEY: 'value', ... } as const
  const objectConstRe =
    /const\s+([A-Z][A-Z0-9_]*(?:STATUSE?S?|STATUS_VALUES?|STATES?))\s*=\s*\{([^}]+)\}/g;

  while ((match = objectConstRe.exec(content)) !== null) {
    const constName = match[1];
    const objectBody = match[2];
    if (!constName || !objectBody) continue;

    // Extract string values (the right-hand side of key: 'value' pairs)
    const valueRe = /:\s*['"`]([^'"`]+)['"`]/g;
    const statusValues: string[] = [];
    let vm: RegExpExecArray | null;
    while ((vm = valueRe.exec(objectBody)) !== null) {
      if (vm[1]) statusValues.push(vm[1]);
    }

    if (statusValues.length < 2) continue;

    // Avoid duplicates with array pattern
    const entityType = inferEntityType(constName);
    if (results.some((r) => r.entityType === entityType && r.moduleKey === moduleKey)) continue;

    results.push({
      entityType,
      statusValues,
      description: buildWorkflowDescription(entityType, statusValues),
      moduleKey,
      filePath,
    });
  }

  // Pattern 3: enum OrderStatus { Draft = 'draft', ... }
  const enumRe = /enum\s+(\w+(?:Status|State|Stage))\s*\{([^}]+)\}/g;

  while ((match = enumRe.exec(content)) !== null) {
    const enumName = match[1];
    const enumBody = match[2];
    if (!enumName || !enumBody) continue;

    // Extract string values
    const valueRe = /=\s*['"`]([^'"`]+)['"`]/g;
    const statusValues: string[] = [];
    let vm: RegExpExecArray | null;
    while ((vm = valueRe.exec(enumBody)) !== null) {
      if (vm[1]) statusValues.push(vm[1]);
    }

    if (statusValues.length < 2) continue;

    // Convert PascalCase enum name to entity type
    const entityType = enumName
      .replace(/Status$|State$|Stage$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim();

    if (results.some((r) => r.entityType === entityType && r.moduleKey === moduleKey)) continue;

    results.push({
      entityType,
      statusValues,
      description: buildWorkflowDescription(entityType, statusValues),
      moduleKey,
      filePath,
    });
  }

  return results;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Scans module files for status enum and constant definitions.
 * Returns business-language workflow descriptions suitable for the AI support knowledge base.
 *
 * @param basePath - Absolute path to the repository root
 */
export function extractWorkflows(basePath: string): ExtractedWorkflow[] {
  const scanDirs = [
    path.join(basePath, 'packages', 'modules'),
    path.join(basePath, 'packages', 'shared', 'src'),
    path.join(basePath, 'apps', 'web', 'src'),
  ];

  const allFiles: string[] = [];
  for (const dir of scanDirs) {
    collectTsFiles(dir, allFiles);
  }

  const results: ExtractedWorkflow[] = [];
  const seen = new Set<string>();

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Quick check to avoid processing files with no status-related patterns
      if (
        !content.includes('STATUSES') &&
        !content.includes('STATES') &&
        !content.includes('Status') &&
        !content.includes('State') &&
        !content.includes('STATUS')
      ) {
        continue;
      }

      const extracted = extractWorkflowsFromContent(content, filePath, basePath);
      for (const workflow of extracted) {
        const key = `${workflow.entityType}:${workflow.moduleKey}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(workflow);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}
