import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, sql, semanticEmbedTokens } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// ── GET /api/v1/semantic/embed/[token] ────────────────────────────
// Public endpoint for rendering embedded widgets. NO auth required.
// Validates the token directly from DB, checks expiration and active
// status, validates origin if allowedOrigins is configured, and
// increments the view count atomically.
//
// Returns the widget configuration and current metric data so the
// embedded iframe can render without further API calls.

export async function GET(request: NextRequest) {
  const token = decodeURIComponent(extractToken(request));

  // Look up the embed token
  const [embedToken] = await db
    .select()
    .from(semanticEmbedTokens)
    .where(eq(semanticEmbedTokens.token, token));

  if (!embedToken) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Embed token not found' } },
      { status: 404 },
    );
  }

  // Check if token is active
  if (!embedToken.isActive) {
    return NextResponse.json(
      { error: { code: 'DEACTIVATED', message: 'This embed token has been deactivated' } },
      { status: 410 },
    );
  }

  // Check expiration
  if (embedToken.expiresAt && new Date(embedToken.expiresAt) < new Date()) {
    return NextResponse.json(
      { error: { code: 'EXPIRED', message: 'This embed token has expired' } },
      { status: 410 },
    );
  }

  // Check origin if allowedOrigins is configured
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (embedToken.allowedOrigins && embedToken.allowedOrigins.length > 0 && origin) {
    const isAllowed = embedToken.allowedOrigins.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        const requestUrl = new URL(origin);
        return allowedUrl.origin === requestUrl.origin;
      } catch {
        return false;
      }
    });

    if (!isAllowed) {
      return NextResponse.json(
        { error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This origin is not authorized to access this embed' } },
        { status: 403 },
      );
    }
  }

  // Increment view count atomically
  await db
    .update(semanticEmbedTokens)
    .set({
      viewCount: sql`${semanticEmbedTokens.viewCount} + 1`,
    })
    .where(eq(semanticEmbedTokens.id, embedToken.id));

  // Fetch current metric data based on widget config
  const metricData = await fetchMetricDataForWidget(
    embedToken.tenantId,
    embedToken.config,
  );

  // Build CORS headers — only set for explicitly configured origins
  const corsHeaders: Record<string, string> = {};
  if (origin && embedToken.allowedOrigins && embedToken.allowedOrigins.length > 0) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  }
  // No CORS header when allowedOrigins is not configured — embeds require explicit origin config

  return NextResponse.json(
    {
      data: {
        widgetType: embedToken.widgetType,
        config: embedToken.config ?? {},
        viewCount: embedToken.viewCount + 1,
        metrics: metricData,
      },
    },
    { headers: corsHeaders },
  );
}

// ── Metric data fetcher for embedded widgets ──────────────────────

interface WidgetConfig {
  metricSlugs?: string[];
  chartType?: string;
  dimensions?: string[];
  filters?: Record<string, unknown>;
  dateRange?: { start?: string; end?: string };
  theme?: string;
  refreshIntervalSeconds?: number;
}

interface MetricSnapshot {
  slug: string;
  value: number;
  previousValue: number | null;
  changePct: number | null;
}

async function fetchMetricDataForWidget(
  tenantId: string,
  config: unknown,
): Promise<MetricSnapshot[]> {
  const widgetConfig = config as WidgetConfig | null;
  const metricSlugs = widgetConfig?.metricSlugs ?? [];

  if (metricSlugs.length === 0) {
    return [];
  }

  const metricExprMap: Record<string, string> = {
    net_sales: 'COALESCE(SUM(net_sales), 0)',
    gross_sales: 'COALESCE(SUM(gross_sales), 0)',
    order_count: 'COALESCE(SUM(order_count), 0)',
    avg_order_value: 'CASE WHEN SUM(order_count) > 0 THEN SUM(net_sales) / SUM(order_count) ELSE 0 END',
    void_count: 'COALESCE(SUM(void_count), 0)',
    discount_total: 'COALESCE(SUM(discount_total), 0)',
    tax_total: 'COALESCE(SUM(tax_total), 0)',
  };

  const todayStr = new Date().toISOString().split('T')[0]!;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0]!;

  const results: MetricSnapshot[] = [];

  for (const slug of metricSlugs.slice(0, 10)) {
    const sqlExpr = metricExprMap[slug];
    if (!sqlExpr) continue;

    try {
      const [todayResult, yesterdayResult] = await Promise.all([
        db.execute(sql`
          SELECT ${sql.raw(sqlExpr)} AS value
          FROM rm_daily_sales
          WHERE tenant_id = ${tenantId}
            AND business_date = ${todayStr}
        `),
        db.execute(sql`
          SELECT ${sql.raw(sqlExpr)} AS value
          FROM rm_daily_sales
          WHERE tenant_id = ${tenantId}
            AND business_date = ${yesterdayStr}
        `),
      ]);

      const todayRows = Array.from(todayResult as Iterable<{ value: string | number }>);
      const yesterdayRows = Array.from(yesterdayResult as Iterable<{ value: string | number }>);
      const todayValue = todayRows[0]?.value != null ? Number(todayRows[0].value) : 0;
      const yesterdayValue = yesterdayRows[0]?.value != null ? Number(yesterdayRows[0].value) : 0;
      const changePct = yesterdayValue > 0
        ? Math.round(((todayValue - yesterdayValue) / yesterdayValue) * 10000) / 100
        : null;

      results.push({
        slug,
        value: todayValue,
        previousValue: yesterdayValue,
        changePct,
      });
    } catch (err) {
      console.warn(`[semantic/embed] Failed to fetch metric ${slug} for tenant ${tenantId}:`, err);
    }
  }

  return results;
}

// ── DELETE /api/v1/semantic/embed/[token] ──────────────────────────
// Revoke (deactivate) an embed token. Authenticated endpoint.
// The path segment is treated as the token's ID (ULID), not the token
// string. Only the creator can revoke their own tokens.

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractToken(request);

    const [row] = await db
      .update(semanticEmbedTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(semanticEmbedTokens.id, id),
          eq(semanticEmbedTokens.tenantId, ctx.tenantId),
          eq(semanticEmbedTokens.createdBy, ctx.user.id),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError('Embed token not found');
    }

    return NextResponse.json({ data: { id: row.id } });
  },
  { entitlement: 'semantic', permission: 'semantic.manage', writeAccess: true },
);
