import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq, and, ne, desc, sql, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { createAdminClient, featureRequests, featureRequestAttachments, tenants } from '@oppsera/db';

// ── GET: single feature request with attachments, similar, history ─

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const db = createAdminClient();
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id is required' } },
      { status: 400 },
    );
  }

  // Main request + tenant name
  const [row] = await db
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
    })
    .from(featureRequests)
    .leftJoin(tenants, eq(featureRequests.tenantId, tenants.id))
    .where(eq(featureRequests.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
      { status: 404 },
    );
  }

  // Fetch attachments
  const attachmentRows = await db
    .select({
      id: featureRequestAttachments.id,
      fileName: featureRequestAttachments.fileName,
      mimeType: featureRequestAttachments.mimeType,
      dataUrl: featureRequestAttachments.dataUrl,
      sizeBytes: featureRequestAttachments.sizeBytes,
      uploadedBy: featureRequestAttachments.uploadedBy,
      createdAt: featureRequestAttachments.createdAt,
    })
    .from(featureRequestAttachments)
    .where(eq(featureRequestAttachments.featureRequestId, id));

  const attachments = Array.from(attachmentRows as Iterable<(typeof attachmentRows)[number]>);

  // Similar requests: same module, excluding self, max 5
  // Use first significant word from title for keyword matching
  const titleWords = row.title.split(/\s+/).filter((w: string) => w.length > 3).slice(0, 3);
  const similarConditions = [
    eq(featureRequests.module, row.module),
    ne(featureRequests.id, id),
  ];
  // If we have title keywords, try to find requests with matching words
  if (titleWords.length > 0) {
    const likePattern = titleWords.map((w: string) => `%${w.toLowerCase()}%`);
    similarConditions.push(
      sql`(${likePattern.map((p: string) => ilike(featureRequests.title, p)).reduce((a: ReturnType<typeof sql>, b: ReturnType<typeof sql>) => sql`${a} OR ${b}`)})`,
    );
  }

  const similarRows = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      status: featureRequests.status,
      priority: featureRequests.priority,
      requestType: featureRequests.requestType,
      createdAt: featureRequests.createdAt,
    })
    .from(featureRequests)
    .where(and(...similarConditions))
    .orderBy(desc(featureRequests.createdAt))
    .limit(5);

  // If keyword match found nothing, fall back to same-module requests
  let similar = Array.from(similarRows as Iterable<(typeof similarRows)[number]>);
  if (similar.length === 0 && titleWords.length > 0) {
    const fallbackRows = await db
      .select({
        id: featureRequests.id,
        title: featureRequests.title,
        status: featureRequests.status,
        priority: featureRequests.priority,
        requestType: featureRequests.requestType,
        createdAt: featureRequests.createdAt,
      })
      .from(featureRequests)
      .where(and(eq(featureRequests.module, row.module), ne(featureRequests.id, id)))
      .orderBy(desc(featureRequests.createdAt))
      .limit(5);
    similar = Array.from(fallbackRows as Iterable<(typeof fallbackRows)[number]>);
  }

  // Submitter history: other requests from same user
  const historyRows = await db
    .select({
      id: featureRequests.id,
      title: featureRequests.title,
      status: featureRequests.status,
      requestType: featureRequests.requestType,
      module: featureRequests.module,
      createdAt: featureRequests.createdAt,
    })
    .from(featureRequests)
    .where(and(eq(featureRequests.submittedBy, row.submittedBy), ne(featureRequests.id, id)))
    .orderBy(desc(featureRequests.createdAt))
    .limit(10);

  const submitterHistory = Array.from(historyRows as Iterable<(typeof historyRows)[number]>);

  return NextResponse.json({
    data: { ...row, attachments },
    similar,
    submitterHistory,
  });
}, 'viewer');

// ── PATCH: update a single feature request ───────────────────────

const patchSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'planned', 'in_progress', 'completed', 'declined']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  adminNotes: z.string().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const PATCH = withAdminAuth(async (req: NextRequest, session, params) => {
  const db = createAdminClient();
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id is required' } },
      { status: 400 },
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map(i => i.message).join('; ') } },
      { status: 400 },
    );
  }

  const { status, priority, adminNotes, tags } = parsed.data;

  if (status === undefined && priority === undefined && adminNotes === undefined && tags === undefined) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'At least one field is required' } },
      { status: 400 },
    );
  }

  // Fetch current row to determine resolution state changes
  const [current] = await db
    .select({ status: featureRequests.status })
    .from(featureRequests)
    .where(eq(featureRequests.id, id))
    .limit(1);

  if (!current) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
      { status: 404 },
    );
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (priority) updates.priority = priority;
  if (adminNotes !== undefined) updates.adminNotes = adminNotes;
  if (tags !== undefined) updates.tags = tags;

  // Resolution tracking
  if (status) {
    const wasResolved = current.status === 'completed' || current.status === 'declined';
    const willResolve = status === 'completed' || status === 'declined';

    if (willResolve && !wasResolved) {
      updates.resolvedAt = new Date();
      updates.resolvedBy = session.adminId;
      updates.resolvedByName = session.name;
    } else if (!willResolve && wasResolved) {
      updates.resolvedAt = null;
      updates.resolvedBy = null;
      updates.resolvedByName = null;
    }
  }

  // Track if this is a notification-worthy status change
  const notifyStatuses = ['planned', 'in_progress', 'completed', 'declined'];
  const shouldNotify = status && notifyStatuses.includes(status) && current.status !== status;

  const [updated] = await db
    .update(featureRequests)
    .set(updates)
    .where(eq(featureRequests.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Feature request not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: updated,
    // Signal to frontend that this status change warrants user notification
    // Actual email delivery would be handled by the event system
    notificationQueued: shouldNotify,
  });
}, 'admin');
