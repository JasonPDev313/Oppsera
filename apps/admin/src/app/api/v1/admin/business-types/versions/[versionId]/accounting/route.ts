import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  getAccountingTemplate,
  saveAccountingTemplate,
  AccountingTemplateInputSchema,
} from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const template = await getAccountingTemplate(versionId);
    return NextResponse.json({ data: template });
  },
  { permission: 'system.business_types.view' },
);

export const PUT = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const body = await req.json();
    const parsed = AccountingTemplateInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await saveAccountingTemplate(versionId, parsed.data, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type_version.accounting_updated',
        entityType: 'business_type_version',
        entityId: versionId,
        afterSnapshot: { validationStatus: result.validationStatus },
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
      if (msg === 'INVALID_ACCOUNTING_DATA') {
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid accounting data' } }, { status: 400 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
