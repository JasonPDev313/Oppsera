import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db } from '@oppsera/db';
import {
  semanticEvalSafetyViolations,
  semanticEvalSafetyRules,
} from '@oppsera/db';
import { sql, and, eq, desc } from 'drizzle-orm';

// ── GET: list violations with cursor pagination + filters ───────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  const limit = Number(searchParams.get('limit') ?? '20');
  const cursor = searchParams.get('cursor');
  const ruleId = searchParams.get('ruleId');
  const severity = searchParams.get('severity');
  const resolved = searchParams.get('resolved');

  const conditions = [];
  if (cursor) conditions.push(sql`${semanticEvalSafetyViolations.id} < ${cursor}`);
  if (ruleId) conditions.push(eq(semanticEvalSafetyViolations.ruleId, ruleId));
  if (severity) conditions.push(eq(semanticEvalSafetyViolations.severity, severity));
  if (resolved === 'true') conditions.push(eq(semanticEvalSafetyViolations.resolved, true));
  if (resolved === 'false') conditions.push(eq(semanticEvalSafetyViolations.resolved, false));

  const rows = await db
    .select({
      id: semanticEvalSafetyViolations.id,
      ruleId: semanticEvalSafetyViolations.ruleId,
      ruleName: semanticEvalSafetyRules.name,
      evalTurnId: semanticEvalSafetyViolations.evalTurnId,
      tenantId: semanticEvalSafetyViolations.tenantId,
      severity: semanticEvalSafetyViolations.severity,
      ruleType: semanticEvalSafetyViolations.ruleType,
      details: semanticEvalSafetyViolations.details,
      resolved: semanticEvalSafetyViolations.resolved,
      resolvedBy: semanticEvalSafetyViolations.resolvedBy,
      resolvedAt: semanticEvalSafetyViolations.resolvedAt,
      createdAt: semanticEvalSafetyViolations.createdAt,
    })
    .from(semanticEvalSafetyViolations)
    .leftJoin(
      semanticEvalSafetyRules,
      eq(semanticEvalSafetyViolations.ruleId, semanticEvalSafetyRules.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(semanticEvalSafetyViolations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: items,
    meta: {
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    },
  });
});
