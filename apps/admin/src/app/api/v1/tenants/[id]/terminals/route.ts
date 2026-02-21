import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { buildAdminCtx } from '@/lib/admin-context';
import { db, sql } from '@oppsera/db';
import { createTerminal } from '@oppsera/core';

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const profitCenterId = sp.get('profitCenterId') ?? '';
  const includeInactive = sp.get('includeInactive') === 'true';

  const conditions = [sql`t.tenant_id = ${tenantId}`];

  if (profitCenterId) {
    conditions.push(sql`t.terminal_location_id = ${profitCenterId}`);
  }
  if (!includeInactive) {
    conditions.push(sql`t.is_active = true`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await db.execute(sql`
    SELECT
      t.id, t.tenant_id, t.terminal_location_id, t.location_id,
      t.title, t.terminal_number, t.device_identifier, t.ip_address,
      t.is_active, t.created_at,
      tl.title AS profit_center_name
    FROM terminals t
    LEFT JOIN terminal_locations tl ON tl.id = t.terminal_location_id
    WHERE ${whereClause}
    ORDER BY t.terminal_number ASC, t.title ASC
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    profitCenterId: r.terminal_location_id as string,
    profitCenterName: (r.profit_center_name as string) ?? '',
    locationId: (r.location_id as string) ?? null,
    name: r.title as string,
    terminalNumber: r.terminal_number != null ? Number(r.terminal_number) : null,
    deviceIdentifier: (r.device_identifier as string) ?? null,
    ipAddress: (r.ip_address as string) ?? null,
    isActive: r.is_active as boolean,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return NextResponse.json({ data: items });
});

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  if (!body.profitCenterId) {
    return NextResponse.json({ error: { message: 'profitCenterId is required' } }, { status: 400 });
  }

  const ctx = buildAdminCtx(session, tenantId);

  try {
    const result = await createTerminal(ctx, body.profitCenterId, {
      name: body.name,
      terminalNumber: body.terminalNumber,
      deviceIdentifier: body.deviceIdentifier,
      ipAddress: body.ipAddress,
      isActive: body.isActive,
    });

    return NextResponse.json(
      { data: { id: result.id, name: result.title, terminalNumber: result.terminalNumber } },
      { status: 201 },
    );
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to create terminal' } },
      { status },
    );
  }
}, 'admin');
