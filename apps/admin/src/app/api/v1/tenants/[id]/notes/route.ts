import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { tenants, superadminSupportNotes, platformAdmins } from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

const VALID_NOTE_TYPES = ['general', 'support_ticket', 'escalation', 'implementation', 'financial'] as const;

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  // Verify tenant exists
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  // Get notes with author info, ordered: pinned first, then by created_at DESC
  const rows = await db.execute(sql`
    SELECT
      n.id, n.tenant_id, n.author_admin_id, n.content, n.note_type,
      n.is_pinned, n.created_at, n.updated_at,
      a.name AS author_name, a.email AS author_email
    FROM superadmin_support_notes n
    LEFT JOIN platform_admins a ON a.id = n.author_admin_id
    WHERE n.tenant_id = ${tenantId}
    ORDER BY n.is_pinned DESC, n.created_at DESC
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const notes = items.map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    authorAdminId: r.author_admin_id as string,
    authorName: (r.author_name as string) ?? 'Unknown',
    authorEmail: (r.author_email as string) ?? '',
    content: r.content as string,
    noteType: r.note_type as string,
    isPinned: r.is_pinned as boolean,
    createdAt: ts(r.created_at) ?? '',
    updatedAt: ts(r.updated_at) ?? '',
  }));

  return NextResponse.json({ data: notes });
});

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  // Verify tenant exists
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  const body = await req.json();
  const content = (body.content ?? '').trim();
  if (!content) {
    return NextResponse.json({ error: { message: 'Content is required' } }, { status: 400 });
  }

  const noteType = body.noteType ?? body.note_type ?? 'general';
  if (!VALID_NOTE_TYPES.includes(noteType as typeof VALID_NOTE_TYPES[number])) {
    return NextResponse.json({
      error: { message: `Invalid note type. Must be one of: ${VALID_NOTE_TYPES.join(', ')}` },
    }, { status: 400 });
  }

  const isPinned = body.isPinned === true || body.is_pinned === true;

  const [created] = await db.insert(superadminSupportNotes).values({
    tenantId,
    authorAdminId: session.adminId,
    content,
    noteType,
    isPinned,
  }).returning();

  void logAdminAudit({
    session,
    action: 'tenant.note.created',
    entityType: 'support_note',
    entityId: created!.id,
    tenantId,
    afterSnapshot: { content: content.substring(0, 100), noteType, isPinned },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(
    {
      data: {
        id: created!.id,
        tenantId,
        authorAdminId: session.adminId,
        authorName: session.name,
        authorEmail: session.email,
        content,
        noteType,
        isPinned,
        createdAt: created!.createdAt.toISOString(),
        updatedAt: created!.updatedAt.toISOString(),
      },
    },
    { status: 201 },
  );
}, 'admin');
