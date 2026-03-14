import * as fs from 'fs';
import * as path from 'path';

// ── Types ────────────────────────────────────────────────────────────

export interface ExtractedPermission {
  filePath: string;
  route: string;
  httpMethod: string;
  permission: string | null;
  entitlement: string | null;
  writeAccess: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Recursively collect all .ts/.tsx files under a directory.
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
 * Convert a file path inside apps/web/src/app/api/v1/ to a URL route.
 * e.g. apps/web/src/app/api/v1/orders/route.ts → /api/v1/orders
 */
function fsPathToApiRoute(filePath: string, apiDir: string): string {
  const rel = path.relative(apiDir, filePath);
  const withoutFile = rel.replace(/[/\\]?route\.(ts|tsx)$/, '');
  const normalized = withoutFile.replace(/\\/g, '/');
  return '/api/v1/' + normalized.replace(/\/$/, '');
}

/**
 * Extract the value of a string literal option from a withMiddleware options object.
 * e.g. extractOption(`{ permission: 'orders.read', writeAccess: true }`, 'permission') → 'orders.read'
 */
function extractStringOption(optionsBlock: string, key: string): string | null {
  const re = new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
  const match = optionsBlock.match(re);
  return match?.[1] ?? null;
}

/**
 * Extract a boolean option from a withMiddleware options object.
 */
function extractBooleanOption(optionsBlock: string, key: string): boolean {
  const re = new RegExp(`${key}\\s*:\\s*(true|false)`);
  const match = optionsBlock.match(re);
  return (match?.[1] ?? 'false') === 'true';
}

/**
 * Parse a route.ts file for `withMiddleware(handler, { ... })` calls.
 * Returns one ExtractedPermission per HTTP method handler found.
 */
function parseRouteFile(
  filePath: string,
  apiDir: string,
): ExtractedPermission[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const route = fsPathToApiRoute(filePath, apiDir);
  const results: ExtractedPermission[] = [];

  // Match: export const GET/POST/PUT/PATCH/DELETE = withMiddleware(...)
  // We need to find each handler export and its associated options object.
  const handlerRe =
    /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*withMiddleware\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = handlerRe.exec(content)) !== null) {
    const httpMethod = match[1] ?? 'GET';
    const afterOpen = content.slice(match.index + match[0].length);

    // Find the options object — it follows the handler function argument.
    // We look for the second argument: a { ... } block.
    // Simple approach: find the last { ... } before the closing ) of withMiddleware.
    const optionsMatch = afterOpen.match(/,\s*(\{[^}]*\})/);
    if (!optionsMatch?.[1]) {
      results.push({
        filePath,
        route,
        httpMethod,
        permission: null,
        entitlement: null,
        writeAccess: false,
      });
      continue;
    }

    const optionsBlock = optionsMatch[1];
    const permission = extractStringOption(optionsBlock, 'permission');
    const entitlement = extractStringOption(optionsBlock, 'entitlement');
    const writeAccess = extractBooleanOption(optionsBlock, 'writeAccess');

    results.push({
      filePath,
      route,
      httpMethod,
      permission,
      entitlement,
      writeAccess,
    });
  }

  return results;
}

// ── Main Export ──────────────────────────────────────────────────────

/**
 * Scans API route files for withMiddleware calls and extracts permission requirements.
 * Returns structured permission data suitable for the AI support knowledge base.
 *
 * @param basePath - Absolute path to the repository root
 */
export function extractPermissions(basePath: string): ExtractedPermission[] {
  const apiDir = path.join(basePath, 'apps', 'web', 'src', 'app', 'api', 'v1');
  const files = collectTsFiles(apiDir);
  const results: ExtractedPermission[] = [];

  for (const filePath of files) {
    // Only process route.ts files
    if (!filePath.endsWith('route.ts') && !filePath.endsWith('route.tsx')) continue;
    try {
      const extracted = parseRouteFile(filePath, apiDir);
      results.push(...extracted);
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}
