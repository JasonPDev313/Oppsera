import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  getRoleTemplate,
  saveRoleTemplate,
  deleteRoleTemplate,
  RoleTemplateInputSchema,
} from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const versionId = params?.versionId;
    const roleId = params?.roleId;
    if (!versionId || !roleId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing params' } }, { status: 400 });

    const role = await getRoleTemplate(roleId, versionId);
    if (!role) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role template not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: role });
  },
  { permission: 'system.business_types.view' },
);

export const PUT = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    const roleId = params?.roleId;
    if (!versionId || !roleId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing params' } }, { status: 400 });

    const body = await req.json();
    const parsed = RoleTemplateInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await saveRoleTemplate(versionId, parsed.data, session.adminId, roleId);

      await logAdminAudit({
        session,
        action: 'business_type_role_template.updated',
        entityType: 'business_type_role_template',
        entityId: result.id,
        afterSnapshot: { roleKey: parsed.data.roleKey },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: result });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, { status: 404 });
      if (msg === 'ROLE_NOT_FOUND') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Role template not found' } }, { status: 404 });
      if (msg === 'ROLE_VERSION_MISMATCH') return NextResponse.json({ error: { code: 'CONFLICT', message: 'Role does not belong to this version' } }, { status: 409 });
      if (msg === 'VERSION_NOT_EDITABLE') return NextResponse.json({ error: { code: 'CONFLICT', message: 'Only draft versions can be edited' } }, { status: 409 });
      if (msg.startsWith('INVALID_PERMISSIONS:')) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: msg } }, { status: 400 });
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);

export const DELETE = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    const roleId = params?.roleId;
    if (!versionId || !roleId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing params' } }, { status: 400 });

    try {
      await deleteRoleTemplate(roleId, versionId, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type_role_template.deleted',
        entityType: 'business_type_role_template',
        entityId: roleId,
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: { success: true } });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND' || msg === 'ROLE_NOT_FOUND') return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
      if (msg === 'VERSION_NOT_EDITABLE') return NextResponse.json({ error: { code: 'CONFLICT', message: 'Only draft versions can be edited' } }, { status: 409 });
      if (msg === 'ROLE_VERSION_MISMATCH') return NextResponse.json({ error: { code: 'CONFLICT', message: 'Role does not belong to this version' } }, { status: 409 });
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
