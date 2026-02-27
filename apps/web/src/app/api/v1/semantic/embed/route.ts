import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc, lt } from 'drizzle-orm';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticEmbedTokens } from '@oppsera/db';
import { parseLimit } from '@/lib/api-params';
import { generateUlid, ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const createEmbedTokenSchema = z.object({
  widgetType: z.enum(['metric_card', 'chart', 'kpi_grid', 'chat']).default('metric_card'),
  config: z.object({
    metricSlugs: z.array(z.string()).max(20).optional(),
    title: z.string().max(200).optional(),
    chartType: z.enum(['line', 'bar', 'pie', 'table']).optional(),
    dimensions: z.array(z.string()).max(10).optional(),
    filters: z.record(z.unknown()).optional(),
    dateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).optional(),
    theme: z.enum(['light', 'dark', 'auto']).optional(),
    refreshIntervalSeconds: z.number().int().min(30).max(86400).optional(),
  }).default({}),
  allowedOrigins: z.array(z.string().url().max(500)).max(10).optional(),
  expiresAt: z.string().datetime().optional(),
});

// ── GET /api/v1/semantic/embed ────────────────────────────────────
// List the current user's embed tokens.
// Supports:
//   ?activeOnly=true (default: true)
//   ?limit=50&cursor=xxx

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') !== 'false';
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [
      eq(semanticEmbedTokens.tenantId, ctx.tenantId),
      eq(semanticEmbedTokens.createdBy, ctx.user.id),
    ];
    if (activeOnly) {
      conditions.push(eq(semanticEmbedTokens.isActive, true));
    }
    if (cursor) {
      conditions.push(lt(semanticEmbedTokens.id, cursor));
    }

    const rows = await db
      .select()
      .from(semanticEmbedTokens)
      .where(and(...conditions))
      .orderBy(desc(semanticEmbedTokens.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((t) => ({
        id: t.id,
        token: t.token,
        widgetType: t.widgetType,
        config: t.config ?? {},
        allowedOrigins: t.allowedOrigins ?? null,
        expiresAt: t.expiresAt ?? null,
        isActive: t.isActive,
        viewCount: t.viewCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);

// ── POST /api/v1/semantic/embed ───────────────────────────────────
// Create a new embed token for embedding a widget externally.
// Generates a cryptographically secure token (32 bytes = 256-bit).

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createEmbedTokenSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { widgetType, config, allowedOrigins, expiresAt } = parsed.data;

    // Generate a cryptographically secure token (32 bytes = 256-bit entropy)
    const token = randomBytes(32).toString('base64url');

    const [row] = await db
      .insert(semanticEmbedTokens)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        createdBy: ctx.user.id,
        token,
        widgetType,
        config,
        allowedOrigins: allowedOrigins ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();

    return NextResponse.json({
      data: {
        id: row!.id,
        token: row!.token,
        widgetType: row!.widgetType,
        config: row!.config ?? {},
        allowedOrigins: row!.allowedOrigins ?? null,
        expiresAt: row!.expiresAt ?? null,
        isActive: row!.isActive,
        viewCount: row!.viewCount,
        createdAt: row!.createdAt,
      },
    }, { status: 201 });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
