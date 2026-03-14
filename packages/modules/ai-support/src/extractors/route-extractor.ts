import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

export interface ExtractedRoute {
  route: string;
  moduleKey: string;
  pageTitle: string;
  description: string;
  filePath: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Recursively collect all files matching a given filename (e.g. "page.tsx").
 */
function collectFiles(dir: string, filename: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, filename, results);
    } else if (entry.isFile() && entry.name === filename) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Convert a Next.js filesystem path to a URL route.
 * e.g. apps/web/src/app/orders/[id]/page.tsx → /orders/[id]
 */
function fsPathToRoute(filePath: string, appDir: string): string {
  const rel = path.relative(appDir, filePath);
  // Remove "page.tsx" from end and normalize separators
  const withoutFile = rel.replace(/[/\\]?page\.tsx$/, '');
  const normalized = withoutFile.replace(/\\/g, '/');
  // Strip (group) segments (Next.js route groups)
  const noGroups = normalized.replace(/\([^)]+\)\/?/g, '');
  return '/' + noGroups.replace(/\/$/, '');
}

/**
 * Derive module key from the route path (first meaningful segment).
 * e.g. /orders/[id] → orders
 */
function deriveModuleKey(route: string): string {
  const segments = route.split('/').filter(Boolean);
  // Skip dynamic segments like [id], [tenantId] for module key
  const firstStatic = segments.find((s) => !s.startsWith('[') && s !== 'api');
  return firstStatic ?? 'platform';
}

/**
 * Extract a page title from the file contents.
 * Tries (in order):
 * 1. `export const metadata = { title: "..." }`
 * 2. `<title>...</title>` JSX
 * 3. The default export function/component name
 * 4. Falls back to capitalised route segment
 */
function extractPageTitle(content: string, route: string): string {
  // 1. metadata.title
  const metadataMatch = content.match(/metadata\s*=\s*\{[^}]*title\s*:\s*['"`]([^'"`]+)['"`]/);
  if (metadataMatch?.[1]) return metadataMatch[1];

  // 2. <title>...</title>
  const titleTagMatch = content.match(/<title>([^<]+)<\/title>/);
  if (titleTagMatch?.[1]) return titleTagMatch[1];

  // 3. Default export component name
  const exportDefaultMatch = content.match(
    /export\s+default\s+function\s+(\w+)|export\s+default\s+(?:async\s+)?function\s+(\w+)/,
  );
  if (exportDefaultMatch) {
    const name = exportDefaultMatch[1] ?? exportDefaultMatch[2];
    if (name && name !== 'Page' && name !== 'Layout') {
      // Convert PascalCase to Title Case
      return name.replace(/([A-Z])/g, ' $1').trim();
    }
  }

  // 4. Fallback: last static route segment, title-cased
  const segments = route.split('/').filter((s) => s && !s.startsWith('['));
  const last = segments[segments.length - 1] ?? 'Page';
  return last
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build a brief business-language description of the page based on its title and route.
 */
function buildDescription(pageTitle: string, moduleKey: string, route: string): string {
  const isListPage = !route.includes('[');
  const isDynamicPage = route.includes('[');

  if (isListPage) {
    return `The ${pageTitle} page in the ${moduleKey} module. Displays a list view for managing ${moduleKey} records.`;
  }
  if (isDynamicPage) {
    return `The ${pageTitle} detail page in the ${moduleKey} module. Shows and manages a specific ${moduleKey} record.`;
  }
  return `The ${pageTitle} page in the ${moduleKey} module.`;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Scans the Next.js app directory for page.tsx files and extracts route metadata.
 * Returns business-language route descriptions suitable for the AI support knowledge base.
 *
 * @param basePath - Absolute path to the repository root
 */
export function extractRoutes(basePath: string): ExtractedRoute[] {
  const appDir = path.join(basePath, 'apps', 'web', 'src', 'app');
  const pageFiles = collectFiles(appDir, 'page.tsx');
  const routes: ExtractedRoute[] = [];

  for (const filePath of pageFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const route = fsPathToRoute(filePath, appDir);

      // Skip API routes (shouldn't be page.tsx but guard anyway)
      if (route.startsWith('/api/')) continue;

      const moduleKey = deriveModuleKey(route);
      const pageTitle = extractPageTitle(content, route);
      const description = buildDescription(pageTitle, moduleKey, route);

      routes.push({
        route,
        moduleKey,
        pageTitle,
        description,
        filePath,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  return routes;
}
