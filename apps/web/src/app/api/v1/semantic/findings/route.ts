import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, desc, lt } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, semanticAnalysisFindings } from '@oppsera/db';
import { parseLimit } from '@/lib/api-params';

// ── GET /api/v1/semantic/findings ─────────────────────────────────
// List background analysis findings for the current tenant.
// Returns unread first, sorted by priority then creation date.
// Supports:
//   ?unreadOnly=true    — show only unread findings
//   ?findingType=trend  — filter by type (trend, anomaly, opportunity, risk, correlation)
//   ?priority=high      — filter by priority (low, medium, high, critical)
//   ?limit=50&cursor=xxx — cursor pagination

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const findingType = url.searchParams.get('findingType') ?? undefined;
    const priority = url.searchParams.get('priority') ?? undefined;
    const limit = parseLimit(url.searchParams.get('limit'));
    const cursor = url.searchParams.get('cursor') ?? undefined;

    const conditions = [eq(semanticAnalysisFindings.tenantId, ctx.tenantId)];
    if (unreadOnly) {
      conditions.push(eq(semanticAnalysisFindings.isRead, false));
    }
    if (findingType) {
      conditions.push(eq(semanticAnalysisFindings.findingType, findingType));
    }
    if (priority) {
      conditions.push(eq(semanticAnalysisFindings.priority, priority));
    }
    if (cursor) {
      conditions.push(lt(semanticAnalysisFindings.id, cursor));
    }

    // Order: unread first, then by priority (critical > high > medium > low), then newest
    const rows = await db
      .select()
      .from(semanticAnalysisFindings)
      .where(and(...conditions))
      .orderBy(
        semanticAnalysisFindings.isRead,
        desc(semanticAnalysisFindings.createdAt),
      )
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      data: items.map((f) => ({
        id: f.id,
        findingType: f.findingType,
        title: f.title,
        summary: f.summary,
        detailedNarrative: f.detailedNarrative ?? null,
        metricSlugs: f.metricSlugs ?? null,
        dimensionValues: f.dimensionValues ?? null,
        businessDateStart: f.businessDateStart ?? null,
        businessDateEnd: f.businessDateEnd ?? null,
        confidence: f.confidence ? Number(f.confidence) : null,
        significanceScore: f.significanceScore ? Number(f.significanceScore) : null,
        baselineValue: f.baselineValue ? Number(f.baselineValue) : null,
        observedValue: f.observedValue ? Number(f.observedValue) : null,
        changePct: f.changePct ? Number(f.changePct) : null,
        chartType: f.chartType ?? null,
        chartData: f.chartData ?? null,
        priority: f.priority,
        isRead: f.isRead,
        readAt: f.readAt ?? null,
        isDismissed: f.isDismissed,
        isActionable: f.isActionable,
        suggestedActions: f.suggestedActions ?? null,
        analysisRunId: f.analysisRunId ?? null,
        analysisDurationMs: f.analysisDurationMs ?? null,
        createdAt: f.createdAt,
      })),
      meta: {
        cursor: hasMore ? items[items.length - 1]!.id : null,
        hasMore,
      },
    });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
