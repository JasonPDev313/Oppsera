import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql, desc, eq, and, ilike, inArray } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { createAdminClient, featureRequests, featureRequestAttachments, tenants } from '@oppsera/db';

// ── GET: list all feature requests (cross-tenant) ───────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const db = createAdminClient();
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') ?? undefined;
  const search = sp.get('search') ?? undefined;
  const module = sp.get('module') ?? undefined;
  const priority = sp.get('priority') ?? undefined;
  const requestType = sp.get('requestType') ?? undefined;
  const tenantId = sp.get('tenantId') ?? undefined;
  const tag = sp.get('tag') ?? undefined;
  const sort = sp.get('sort') ?? 'created'; // 'votes' | 'created' | 'priority'
  const cursor = sp.get('cursor') ?? undefined;
  const limitParam = sp.get('limit') ? Number(sp.get('limit')) : 50;
  const limit = Math.min(Math.max(limitParam, 1), 200);

  const conditions = [];
  if (status) conditions.push(eq(featureRequests.status, status));
  if (module) conditions.push(eq(featureRequests.module, module));
  if (priority) conditions.push(eq(featureRequests.priority, priority));
  if (requestType) conditions.push(eq(featureRequests.requestType, requestType));
  if (tenantId) conditions.push(eq(featureRequests.tenantId, tenantId));
  if (tag) conditions.push(sql`${tag} = ANY(${featureRequests.tags})`);
  if (search) {
    conditions.push(
      sql`(${ilike(featureRequests.title, `%${search}%`)} OR ${ilike(featureRequests.description, `%${search}%`)})`,
    );
  }
  if (cursor) {
    conditions.push(sql`${featureRequests.createdAt} < ${cursor}`);
  }

  // Attachment count subquery
  const attachmentCountSq = db
    .select({
      featureRequestId: featureRequestAttachments.featureRequestId,
      count: sql<number>`count(*)::int`.as('attachment_count'),
    })
    .from(featureRequestAttachments)
    .groupBy(featureRequestAttachments.featureRequestId)
    .as('att_counts');

  // Determine sort order
  const orderBy =
    sort === 'votes'
      ? [desc(featureRequests.voteCount), desc(featureRequests.createdAt)]
      : sort === 'priority'
        ? [
            sql`CASE ${featureRequests.priority}
              WHEN 'critical' THEN 0
              WHEN 'high' THEN 1
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 3
              ELSE 4
            END`,
            desc(featureRequests.createdAt),
          ]
        : [desc(featureRequests.createdAt)];

  const rows = await db
    .select({
      id: featureRequests.id,
      tenantId: featureRequests.tenantId,
      tenantName: tenants.name,
      locationId: featureRequests.locationId,
      submittedBy: featureRequests.submittedBy,
      submittedByName: featureRequests.submittedByName,
      submittedByEmail: featureRequests.submittedByEmail,
      requestType: featureRequests.requestType,
      module: featureRequests.module,
      submodule: featureRequests.submodule,
      title: featureRequests.title,
      description: featureRequests.description,
      businessImpact: featureRequests.businessImpact,
      priority: featureRequests.priority,
      additionalNotes: featureRequests.additionalNotes,
      currentWorkaround: featureRequests.currentWorkaround,
      status: featureRequests.status,
      adminNotes: featureRequests.adminNotes,
      tags: featureRequests.tags,
      resolvedAt: featureRequests.resolvedAt,
      resolvedBy: featureRequests.resolvedBy,
      resolvedByName: featureRequests.resolvedByName,
      voteCount: featureRequests.voteCount,
      createdAt: featureRequests.createdAt,
      updatedAt: featureRequests.updatedAt,
      attachmentCount: sql<number>`COALESCE(${attachmentCountSq.count}, 0)`.as('attachment_count'),
    })
    .from(featureRequests)
    .leftJoin(tenants, eq(featureRequests.tenantId, tenants.id))
    .leftJoin(attachmentCountSq, eq(featureRequests.id, attachmentCountSq.featureRequestId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(limit + 1);

  const items = Array.from(rows as Iterable<(typeof rows)[number]>);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1]!.createdAt?.toISOString()
    : undefined;

  // ── Aggregate stats ────────────────────────────────────────
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      submitted: sql<number>`count(*) filter (where ${featureRequests.status} = 'submitted')::int`,
      underReview: sql<number>`count(*) filter (where ${featureRequests.status} = 'under_review')::int`,
      planned: sql<number>`count(*) filter (where ${featureRequests.status} = 'planned')::int`,
      inProgress: sql<number>`count(*) filter (where ${featureRequests.status} = 'in_progress')::int`,
      completed: sql<number>`count(*) filter (where ${featureRequests.status} = 'completed')::int`,
      declined: sql<number>`count(*) filter (where ${featureRequests.status} = 'declined')::int`,
    })
    .from(featureRequests);

  // ── Module breakdown ───────────────────────────────────────
  const moduleBreakdown = await db
    .select({
      module: featureRequests.module,
      count: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${featureRequests.status} NOT IN ('completed', 'declined'))::int`,
    })
    .from(featureRequests)
    .groupBy(featureRequests.module)
    .orderBy(desc(sql`count(*)`));

  const moduleStats = Array.from(moduleBreakdown as Iterable<(typeof moduleBreakdown)[number]>);

  return NextResponse.json({
    data: items,
    meta: { cursor: nextCursor, hasMore },
    stats: stats ?? {},
    moduleStats,
  });
}, 'viewer');

// ── PATCH: bulk update status ────────────────────────────────────

export const PATCH = withAdminAuth(async (req: NextRequest, session) => {
  const db = createAdminClient();
  const body = await req.json();
  const { ids, status, adminNotes, tags } = body as {
    ids: string[];
    status?: string;
    adminNotes?: string;
    tags?: string[];
  };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'ids array is required' } },
      { status: 400 },
    );
  }

  const VALID_STATUSES = ['submitted', 'under_review', 'planned', 'in_progress', 'completed', 'declined'];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `Invalid status: ${status}` } },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) {
    updates.status = status;
    const willResolve = status === 'completed' || status === 'declined';
    if (willResolve) {
      // Use SQL COALESCE to preserve original resolvedAt if already set
      updates.resolvedAt = sql`COALESCE(${featureRequests.resolvedAt}, NOW())`;
      updates.resolvedBy = sql`COALESCE(${featureRequests.resolvedBy}, ${session.adminId})`;
      updates.resolvedByName = sql`COALESCE(${featureRequests.resolvedByName}, ${session.name})`;
    } else {
      updates.resolvedAt = null;
      updates.resolvedBy = null;
      updates.resolvedByName = null;
    }
  }
  if (adminNotes !== undefined) updates.adminNotes = adminNotes;
  if (tags !== undefined) updates.tags = tags;

  await db
    .update(featureRequests)
    .set(updates)
    .where(inArray(featureRequests.id, ids));

  return NextResponse.json({ data: { updated: ids.length } });
}, 'admin');
