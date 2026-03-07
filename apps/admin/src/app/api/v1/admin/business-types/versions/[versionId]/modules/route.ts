import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  getModuleDefaults,
  saveModuleDefaults,
  SaveModuleDefaultsInputSchema,
  MODULE_ENTRIES,
} from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── GET — module defaults + full registry ───────────────────────

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const defaults = await getModuleDefaults(versionId);

    return NextResponse.json({
      data: {
        defaults,
        registry: MODULE_ENTRIES,
      },
    });
  },
  { permission: 'system.business_types.view' },
);

// ── PUT — replace all module defaults ───────────────────────────

export const PUT = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const body = await req.json();
    const parsed = SaveModuleDefaultsInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await saveModuleDefaults(versionId, parsed.data.modules, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type_version.modules_updated',
        entityType: 'business_type_version',
        entityId: versionId,
        afterSnapshot: { moduleCount: parsed.data.modules.filter((m) => m.isEnabled).length },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: result });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, { status: 404 });
      }
      if (msg === 'VERSION_NOT_EDITABLE') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Only draft versions can be edited' } }, { status: 409 });
      }
      if (msg.startsWith('INVALID_MODULE_KEY:')) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, { status: 400 });
      }
      if (msg.startsWith('DEPENDENCY_ERRORS:')) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: msg.replace('DEPENDENCY_ERRORS:', '') } }, { status: 400 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
