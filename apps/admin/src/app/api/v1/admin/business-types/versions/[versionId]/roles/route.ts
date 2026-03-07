import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listRoleTemplates, saveRoleTemplate, RoleTemplateInputSchema } from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const roles = await listRoleTemplates(versionId);
    return NextResponse.json({ data: roles });
  },
  { permission: 'system.business_types.view' },
);

// POST to create a new role template for this version
export const POST = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const body = await req.json();
    const parsed = RoleTemplateInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await saveRoleTemplate(versionId, parsed.data, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type_role_template.saved',
        entityType: 'business_type_role_template',
        entityId: result.id,
        afterSnapshot: { roleKey: parsed.data.roleKey, permissionCount: parsed.data.permissions.length },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: result }, { status: 201 });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, { status: 404 });
      }
      if (msg === 'VERSION_NOT_EDITABLE') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Only draft versions can be edited' } }, { status: 409 });
      }
      if (msg.startsWith('INVALID_PERMISSIONS:')) {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, { status: 400 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
