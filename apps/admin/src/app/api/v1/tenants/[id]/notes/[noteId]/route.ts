import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { superadminSupportNotes } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

const VALID_NOTE_TYPES = ['general', 'support_ticket', 'escalation', 'implementation', 'financial'] as const;

export const PATCH = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const noteId = params?.noteId;
  if (!tenantId || !noteId) {
    return NextResponse.json({ error: { message: 'Missing tenant ID or note ID' } }, { status: 400 });
  }

  const [note] = await db
    .select()
    .from(superadminSupportNotes)
    .where(and(eq(superadminSupportNotes.id, noteId), eq(superadminSupportNotes.tenantId, tenantId)));

  if (!note) {
    return NextResponse.json({ error: { message: 'Note not found' } }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.content !== undefined) {
    const content = (body.content as string).trim();
    if (!content) return NextResponse.json({ error: { message: 'Content cannot be empty' } }, { status: 400 });
    updates.content = content;
  }

  if (body.noteType !== undefined || body.note_type !== undefined) {
    const noteType = body.noteType ?? body.note_type;
    if (!VALID_NOTE_TYPES.includes(noteType as typeof VALID_NOTE_TYPES[number])) {
      return NextResponse.json({
        error: { message: `Invalid note type. Must be one of: ${VALID_NOTE_TYPES.join(', ')}` },
      }, { status: 400 });
    }
    updates.noteType = noteType;
  }

  if (body.isPinned !== undefined || body.is_pinned !== undefined) {
    updates.isPinned = body.isPinned === true || body.is_pinned === true;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: { message: 'No fields to update' } }, { status: 400 });
  }

  const [updated] = await db
    .update(superadminSupportNotes)
    .set(updates)
    .where(eq(superadminSupportNotes.id, noteId))
    .returning();

  void logAdminAudit({
    session,
    action: 'tenant.note.updated',
    entityType: 'support_note',
    entityId: noteId,
    tenantId,
    beforeSnapshot: { content: note.content.substring(0, 100), noteType: note.noteType, isPinned: note.isPinned },
    afterSnapshot: { content: (updated!.content).substring(0, 100), noteType: updated!.noteType, isPinned: updated!.isPinned },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({
    data: {
      id: updated!.id,
      tenantId,
      content: updated!.content,
      noteType: updated!.noteType,
      isPinned: updated!.isPinned,
      updatedAt: updated!.updatedAt.toISOString(),
    },
  });
}, { permission: 'tenants.write' });

export const DELETE = withAdminPermission(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const noteId = params?.noteId;
  if (!tenantId || !noteId) {
    return NextResponse.json({ error: { message: 'Missing tenant ID or note ID' } }, { status: 400 });
  }

  const [note] = await db
    .select()
    .from(superadminSupportNotes)
    .where(and(eq(superadminSupportNotes.id, noteId), eq(superadminSupportNotes.tenantId, tenantId)));

  if (!note) {
    return NextResponse.json({ error: { message: 'Note not found' } }, { status: 404 });
  }

  await db.delete(superadminSupportNotes).where(eq(superadminSupportNotes.id, noteId));

  void logAdminAudit({
    session,
    action: 'tenant.note.deleted',
    entityType: 'support_note',
    entityId: noteId,
    tenantId,
    beforeSnapshot: { content: note.content.substring(0, 100), noteType: note.noteType },
    ipAddress: getClientIp(req),
  });

  return new NextResponse(null, { status: 204 });
}, { permission: 'tenants.write' });
