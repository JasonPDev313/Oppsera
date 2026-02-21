import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { buildAdminCtx } from '@/lib/admin-context';
import { updateTerminal, deactivateTerminal } from '@oppsera/core';

export const PATCH = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  const tId = params?.tId;
  if (!tenantId || !tId) {
    return NextResponse.json({ error: { message: 'Missing tenant or terminal ID' } }, { status: 400 });
  }

  const body = await req.json();
  const ctx = buildAdminCtx(session, tenantId);

  try {
    // If only deactivating, use deactivateTerminal
    if (body.isActive === false && Object.keys(body).length === 1) {
      const result = await deactivateTerminal(ctx, tId);
      return NextResponse.json({
        data: { id: result.id, name: result.title, isActive: result.isActive },
      });
    }

    const result = await updateTerminal(ctx, tId, {
      name: body.name,
      terminalNumber: body.terminalNumber,
      deviceIdentifier: body.deviceIdentifier,
      ipAddress: body.ipAddress,
      isActive: body.isActive,
    });

    return NextResponse.json({
      data: { id: result.id, name: result.title, isActive: result.isActive },
    });
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to update terminal' } },
      { status },
    );
  }
}, 'admin');
