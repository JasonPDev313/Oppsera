import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';

export const GET = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const templateId = params?.id;
  if (!templateId) return NextResponse.json({ error: { message: 'Missing template ID' } }, { status: 400 });

  const rows = await db.execute(
    sql`SELECT id, name, description, business_type, is_system, modules, created_by, created_at, updated_at
        FROM module_templates WHERE id = ${templateId}`,
  );
  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  if (items.length === 0) {
    return NextResponse.json({ error: { message: 'Template not found' } }, { status: 404 });
  }

  const r = items[0]!;
  return NextResponse.json({
    data: {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      businessType: (r.business_type as string) ?? null,
      isSystem: r.is_system as boolean,
      modules: (r.modules ?? []) as { moduleKey: string; accessMode: string }[],
      createdBy: (r.created_by as string) ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    },
  });
});

export const PATCH = withAdminAuth(async (req: NextRequest, _session, params) => {
  const templateId = params?.id;
  if (!templateId) return NextResponse.json({ error: { message: 'Missing template ID' } }, { status: 400 });

  // Cannot edit system templates
  const existing = Array.from(
    (await db.execute(sql`SELECT is_system FROM module_templates WHERE id = ${templateId}`)) as Iterable<Record<string, unknown>>,
  );
  if (existing.length === 0) return NextResponse.json({ error: { message: 'Template not found' } }, { status: 404 });
  if (existing[0]!.is_system) return NextResponse.json({ error: { message: 'Cannot edit system templates' } }, { status: 403 });

  const body = await req.json();
  const sets: string[] = [];
  const name = body.name as string | undefined;
  const description = body.description as string | undefined;
  const modules = body.modules as { moduleKey: string; accessMode: string }[] | undefined;

  if (name) sets.push('name');
  if (description !== undefined) sets.push('description');
  if (modules) sets.push('modules');

  if (sets.length === 0) {
    return NextResponse.json({ error: { message: 'No fields to update' } }, { status: 400 });
  }

  await db.execute(sql`
    UPDATE module_templates SET
      ${name ? sql`name = ${name},` : sql``}
      ${description !== undefined ? sql`description = ${description},` : sql``}
      ${modules ? sql`modules = ${JSON.stringify(modules)},` : sql``}
      updated_at = NOW()
    WHERE id = ${templateId} AND is_system = false
  `);

  return NextResponse.json({ data: { id: templateId, updated: true } });
}, 'admin');

export const DELETE = withAdminAuth(async (_req: NextRequest, _session, params) => {
  const templateId = params?.id;
  if (!templateId) return NextResponse.json({ error: { message: 'Missing template ID' } }, { status: 400 });

  const result = await db.execute(
    sql`DELETE FROM module_templates WHERE id = ${templateId} AND is_system = false`,
  );
  const count = Array.from(result as Iterable<unknown>).length;

  if (count === 0) {
    return NextResponse.json({ error: { message: 'Template not found or is a system template' } }, { status: 404 });
  }

  return NextResponse.json({ data: { deleted: true } });
}, 'admin');
