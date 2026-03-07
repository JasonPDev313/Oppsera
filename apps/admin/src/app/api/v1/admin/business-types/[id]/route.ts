import { NextResponse } from 'next/server';

import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  getBusinessType,
  getPublishedVersion,
  getDraftVersion,
  listVersionHistory,
  updateBusinessTypeMetadata,
  UpdateBusinessTypeMetadataInputSchema,
} from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/business-types/:id ────────────────────────

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    const businessType = await getBusinessType(id);
    if (!businessType) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Business type not found' } }, { status: 404 });
    }

    const [published, draft, versions] = await Promise.all([
      getPublishedVersion(id),
      getDraftVersion(id),
      listVersionHistory(id),
    ]);

    return NextResponse.json({
      data: {
        ...businessType,
        publishedVersion: published,
        draftVersion: draft,
        versions,
      },
    });
  },
  { permission: 'system.business_types.view' },
);

// ── PATCH /api/v1/admin/business-types/:id ──────────────────────

export const PATCH = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    const body = await req.json();
    const parsed = UpdateBusinessTypeMetadataInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const updated = await updateBusinessTypeMetadata(id, parsed.data, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type.updated',
        entityType: 'business_type',
        entityId: id,
        afterSnapshot: parsed.data,
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Business type not found' } }, { status: 404 });
      }
      if (msg === 'INVALID_CATEGORY') {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'The specified category does not exist' } }, { status: 400 });
      }
      if (msg === 'CANNOT_DEACTIVATE_SIGNUP_VISIBLE') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Cannot deactivate while visible at signup' } }, { status: 409 });
      }
      if (msg === 'SYSTEM_TYPE_IMMUTABLE') {
        return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'System business types cannot be modified' } }, { status: 403 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
