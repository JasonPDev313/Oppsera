import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCustomLens } from '@oppsera/module-semantic/lenses';
import { getLens } from '@oppsera/module-semantic/registry';

// ── Extract slug from URL ─────────────────────────────────────────

function slugFromUrl(url: string): string {
  const parts = new URL(url).pathname.split('/');
  return parts[parts.length - 1] ?? '';
}

// ── GET /api/v1/semantic/lenses/[slug] ───────────────────────────
// Returns a single lens. Read-only — management is handled by the admin portal.
// Checks custom tenant lenses first, then falls back to system lenses.

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const slug = decodeURIComponent(slugFromUrl(request.url));

    // Try custom (tenant-specific) first
    try {
      const lens = await getCustomLens(ctx.tenantId, slug);
      return NextResponse.json({ data: { ...lens, isSystem: false } });
    } catch {
      // Fall through to system lenses
    }

    // Try system lens from registry
    const systemLens = await getLens(slug);
    if (systemLens) {
      return NextResponse.json({ data: { ...systemLens, isSystem: true } });
    }

    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Lens not found: ${slug}` } },
      { status: 404 },
    );
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
