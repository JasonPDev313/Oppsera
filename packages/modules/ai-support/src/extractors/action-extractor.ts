import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

export interface ExtractedAction {
  filePath: string;
  actionLabel: string;
  /** The surrounding JSX context (nearest parent element's tag name, if detectable) */
  contextElement: string;
  /** Raw snippet of code around the data-ai-action attribute */
  snippet: string;
  /** Module key inferred from file path */
  moduleKey: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Recursively collect all .tsx files under a directory.
 */
function collectTsxFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsxFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Derive a module key from the component file path.
 * e.g. apps/web/src/components/orders/OrderList.tsx → orders
 */
function deriveModuleKeyFromPath(filePath: string, basePath: string): string {
  const rel = path.relative(basePath, filePath).replace(/\\/g, '/');
  // Try components/<module>/...
  const compMatch = rel.match(/components\/([^/]+)\//);
  if (compMatch?.[1]) return compMatch[1];
  // Try app/<module>/...
  const appMatch = rel.match(/app\/([^/[(]+)\//);
  if (appMatch?.[1] && appMatch[1] !== 'api') return appMatch[1];
  return 'platform';
}

/**
 * Extract all data-ai-action attributes from a TSX file content.
 * Returns label + a short code snippet for context.
 */
function extractActionsFromContent(
  content: string,
  _filePath: string,
  _basePath: string,
): Array<{ actionLabel: string; contextElement: string; snippet: string }> {
  const results: Array<{ actionLabel: string; contextElement: string; snippet: string }> = [];

  // Match data-ai-action="..." or data-ai-action={'...'}
  const re = /data-ai-action\s*=\s*(?:['"`]([^'"`]+)['"`]|\{['"`]([^'"`]+)['"`]\})/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const actionLabel = match[1] ?? match[2];
    if (!actionLabel) continue;

    // Extract snippet: 100 chars before and after the match
    const start = Math.max(0, match.index - 100);
    const end = Math.min(content.length, match.index + match[0].length + 100);
    const snippet = content.slice(start, end).replace(/\s+/g, ' ').trim();

    // Try to detect the surrounding element tag
    const before = content.slice(start, match.index);
    const tagMatch = before.match(/<(\w+)[^>]*$/);
    const contextElement = tagMatch?.[1] ?? 'unknown';

    results.push({ actionLabel, contextElement, snippet });
  }

  return results;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Scans component files for data-ai-action attributes and extracts action metadata.
 * Returns structured action data suitable for the AI support knowledge base.
 *
 * @param basePath - Absolute path to the repository root
 */
export function extractActions(basePath: string): ExtractedAction[] {
  const componentsDir = path.join(basePath, 'apps', 'web', 'src', 'components');
  const appDir = path.join(basePath, 'apps', 'web', 'src', 'app');

  const files = [
    ...collectTsxFiles(componentsDir),
    ...collectTsxFiles(appDir),
  ];

  const results: ExtractedAction[] = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes('data-ai-action')) continue;

      const moduleKey = deriveModuleKeyFromPath(filePath, basePath);
      const extracted = extractActionsFromContent(content, filePath, basePath);

      for (const item of extracted) {
        results.push({
          filePath,
          moduleKey,
          ...item,
        });
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}
