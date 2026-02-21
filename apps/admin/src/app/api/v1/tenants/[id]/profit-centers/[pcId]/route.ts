import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { buildAdminCtx } from '@/lib/admin-context';
import { updateProfitCenter, deactivateProfitCenter } from '@oppsera/core';

export const PATCH = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const pcId = params?.pcId;
  if (!tenantId || !pcId) {
    return NextResponse.json({ error: { message: 'Missing tenant or profit center ID' } }, { status: 400 });
  }

  const body = await req.json();
  const ctx = buildAdminCtx(session, tenantId);

  try {
    // If setting isActive=false, use deactivateProfitCenter (cascades to terminals)
    if (body.isActive === false && Object.keys(body).length === 1) {
      const result = await deactivateProfitCenter(ctx, pcId);
      return NextResponse.json({
        data: { id: result.id, name: result.title, isActive: result.isActive },
      });
    }

    const result = await updateProfitCenter(ctx, pcId, {
      name: body.name,
      code: body.code,
      description: body.description,
      icon: body.icon,
      tipsApplicable: body.tipsApplicable,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({
      data: { id: result.id, name: result.title, isActive: result.isActive },
    });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to update profit center' } },
      { status },
    );
  }
}, 'admin');
