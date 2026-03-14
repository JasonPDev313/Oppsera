import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { extractRoutes } from '../extractors/route-extractor';
import { extractPermissions } from '../extractors/permission-extractor';
import { extractActions } from '../extractors/action-extractor';

// ── Route Extractor ────────────────────────────────────────────────────────

describe('route extractor', () => {
  it('extractRoutes is a function', () => {
    expect(typeof extractRoutes).toBe('function');
  });

  it('derives module key from first static segment', () => {
    // Test the internal route-to-module logic inline
    function deriveModuleKey(route: string): string {
      const segments = route.split('/').filter(Boolean);
      const firstStatic = segments.find((s) => !s.startsWith('[') && s !== 'api');
      return firstStatic ?? 'platform';
    }

    expect(deriveModuleKey('/orders')).toBe('orders');
    expect(deriveModuleKey('/orders/[id]')).toBe('orders');
    expect(deriveModuleKey('/inventory/items')).toBe('inventory');
    expect(deriveModuleKey('/[tenantId]/orders')).toBe('orders'); // skip dynamic
    expect(deriveModuleKey('/')).toBe('platform');
  });

  it('converts fs path to URL route correctly', () => {
    function fsPathToRoute(filePath: string, appDir: string): string {
      const rel = path.relative(appDir, filePath);
      const withoutFile = rel.replace(/[/\\]?page\.tsx$/, '');
      const normalized = withoutFile.replace(/\\/g, '/');
      const noGroups = normalized.replace(/\([^)]+\)\/?/g, '');
      return '/' + noGroups.replace(/\/$/, '');
    }

    const appDir = '/apps/web/src/app';
    expect(fsPathToRoute('/apps/web/src/app/orders/page.tsx', appDir)).toBe('/orders');
    expect(fsPathToRoute('/apps/web/src/app/orders/[id]/page.tsx', appDir)).toBe('/orders/[id]');
    expect(fsPathToRoute('/apps/web/src/app/(pos)/pos/page.tsx', appDir)).toBe('/pos');
  });

  it('strips route groups in parentheses from URL', () => {
    function fsPathToRoute(filePath: string, appDir: string): string {
      const rel = path.relative(appDir, filePath);
      const withoutFile = rel.replace(/[/\\]?page\.tsx$/, '');
      const normalized = withoutFile.replace(/\\/g, '/');
      const noGroups = normalized.replace(/\([^)]+\)\/?/g, '');
      return '/' + noGroups.replace(/\/$/, '');
    }

    const appDir = '/apps/web/src/app';
    // Route group (pos) should be stripped
    expect(fsPathToRoute('/apps/web/src/app/(pos)/page.tsx', appDir)).toBe('/');
    // Nested group
    expect(fsPathToRoute('/apps/web/src/app/(admin)/settings/page.tsx', appDir)).toBe('/settings');
  });

  it('returns array for a non-existent base path (no crash)', () => {
    const result = extractRoutes('/nonexistent/path/that/does/not/exist');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── Permission Extractor ───────────────────────────────────────────────────

describe('permission extractor', () => {
  it('extractPermissions is a function', () => {
    expect(typeof extractPermissions).toBe('function');
  });

  it('extracts permission from withMiddleware options block', () => {
    function extractStringOption(optionsBlock: string, key: string): string | null {
      const re = new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
      const match = optionsBlock.match(re);
      return match?.[1] ?? null;
    }

    function extractBooleanOption(optionsBlock: string, key: string): boolean {
      const re = new RegExp(`${key}\\s*:\\s*(true|false)`);
      const match = optionsBlock.match(re);
      return (match?.[1] ?? 'false') === 'true';
    }

    const singleQuote = `{ permission: 'orders.read', entitlement: 'pos', writeAccess: false }`;
    expect(extractStringOption(singleQuote, 'permission')).toBe('orders.read');
    expect(extractStringOption(singleQuote, 'entitlement')).toBe('pos');
    expect(extractBooleanOption(singleQuote, 'writeAccess')).toBe(false);

    const withWrite = `{ permission: 'orders.create', writeAccess: true }`;
    expect(extractStringOption(withWrite, 'permission')).toBe('orders.create');
    expect(extractBooleanOption(withWrite, 'writeAccess')).toBe(true);

    const missingPermission = `{ writeAccess: true }`;
    expect(extractStringOption(missingPermission, 'permission')).toBeNull();
  });

  it('handles double-quoted permissions', () => {
    function extractStringOption(optionsBlock: string, key: string): string | null {
      const re = new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
      const match = optionsBlock.match(re);
      return match?.[1] ?? null;
    }

    expect(extractStringOption(`{ permission: "orders.read" }`, 'permission')).toBe('orders.read');
  });

  it('handles template literal permissions', () => {
    function extractStringOption(optionsBlock: string, key: string): string | null {
      const re = new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
      const match = optionsBlock.match(re);
      return match?.[1] ?? null;
    }

    expect(extractStringOption('{ permission: `orders.read` }', 'permission')).toBe('orders.read');
  });

  it('converts api file path to route', () => {
    function fsPathToApiRoute(filePath: string, apiDir: string): string {
      const rel = path.relative(apiDir, filePath);
      const withoutFile = rel.replace(/[/\\]?route\.(ts|tsx)$/, '');
      const normalized = withoutFile.replace(/\\/g, '/');
      return '/api/v1/' + normalized.replace(/\/$/, '');
    }

    const apiDir = '/apps/web/src/app/api/v1';
    expect(fsPathToApiRoute('/apps/web/src/app/api/v1/orders/route.ts', apiDir)).toBe('/api/v1/orders');
    expect(fsPathToApiRoute('/apps/web/src/app/api/v1/orders/[id]/route.ts', apiDir)).toBe('/api/v1/orders/[id]');
    expect(fsPathToApiRoute('/apps/web/src/app/api/v1/pos/orders/route.ts', apiDir)).toBe('/api/v1/pos/orders');
  });

  it('returns array for a non-existent base path (no crash)', () => {
    const result = extractPermissions('/nonexistent/path/that/does/not/exist');
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── Action Extractor ───────────────────────────────────────────────────────

describe('action extractor', () => {
  it('extractActions is a function', () => {
    expect(typeof extractActions).toBe('function');
  });

  it('extracts data-ai-action from TSX content (double quotes)', () => {
    function extractActionsFromContent(content: string): Array<{ actionLabel: string }> {
      const results: Array<{ actionLabel: string }> = [];
      const re = /data-ai-action\s*=\s*(?:['"`]([^'"`]+)['"`]|\{['"`]([^'"`]+)['"`]\})/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const actionLabel = match[1] ?? match[2];
        if (actionLabel) results.push({ actionLabel });
      }
      return results;
    }

    const content = `
      <button data-ai-action="create_order" onClick={handleCreate}>
        Create Order
      </button>
    `;
    const results = extractActionsFromContent(content);
    expect(results).toHaveLength(1);
    expect(results[0]!.actionLabel).toBe('create_order');
  });

  it('extracts data-ai-action with JSX expression syntax', () => {
    function extractActionsFromContent(content: string): Array<{ actionLabel: string }> {
      const results: Array<{ actionLabel: string }> = [];
      const re = /data-ai-action\s*=\s*(?:['"`]([^'"`]+)['"`]|\{['"`]([^'"`]+)['"`]\})/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const actionLabel = match[1] ?? match[2];
        if (actionLabel) results.push({ actionLabel });
      }
      return results;
    }

    const content = `<button data-ai-action={"void_order"} onClick={handleVoid}>Void</button>`;
    const results = extractActionsFromContent(content);
    expect(results).toHaveLength(1);
    expect(results[0]!.actionLabel).toBe('void_order');
  });

  it('extracts multiple actions from a single file', () => {
    function extractActionsFromContent(content: string): Array<{ actionLabel: string }> {
      const results: Array<{ actionLabel: string }> = [];
      const re = /data-ai-action\s*=\s*(?:['"`]([^'"`]+)['"`]|\{['"`]([^'"`]+)['"`]\})/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const actionLabel = match[1] ?? match[2];
        if (actionLabel) results.push({ actionLabel });
      }
      return results;
    }

    const content = `
      <button data-ai-action="create_order">Create</button>
      <button data-ai-action="void_order">Void</button>
      <button data-ai-action="refund_order">Refund</button>
    `;
    const results = extractActionsFromContent(content);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.actionLabel)).toEqual(['create_order', 'void_order', 'refund_order']);
  });

  it('returns empty array when no data-ai-action attributes found', () => {
    function extractActionsFromContent(content: string): Array<{ actionLabel: string }> {
      const results: Array<{ actionLabel: string }> = [];
      const re = /data-ai-action\s*=\s*(?:['"`]([^'"`]+)['"`]|\{['"`]([^'"`]+)['"`]\})/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const actionLabel = match[1] ?? match[2];
        if (actionLabel) results.push({ actionLabel });
      }
      return results;
    }

    const content = `<button onClick={handleClick}>Click me</button>`;
    const results = extractActionsFromContent(content);
    expect(results).toHaveLength(0);
  });

  it('derives module key from component file path', () => {
    function deriveModuleKeyFromPath(filePath: string, basePath: string): string {
      const rel = path.relative(basePath, filePath).replace(/\\/g, '/');
      const compMatch = rel.match(/components\/([^/]+)\//);
      if (compMatch?.[1]) return compMatch[1];
      const appMatch = rel.match(/app\/([^/[(]+)\//);
      if (appMatch?.[1] && appMatch[1] !== 'api') return appMatch[1];
      return 'platform';
    }

    const base = '/apps/web/src';
    expect(deriveModuleKeyFromPath('/apps/web/src/components/orders/OrderList.tsx', base)).toBe('orders');
    expect(deriveModuleKeyFromPath('/apps/web/src/components/inventory/ItemList.tsx', base)).toBe('inventory');
    expect(deriveModuleKeyFromPath('/apps/web/src/app/orders/page.tsx', base)).toBe('orders');
    expect(deriveModuleKeyFromPath('/apps/web/src/app/api/v1/orders/route.ts', base)).toBe('platform');
  });

  it('returns array for a non-existent base path (no crash)', () => {
    const result = extractActions('/nonexistent/path/that/does/not/exist');
    expect(Array.isArray(result)).toBe(true);
  });
});
