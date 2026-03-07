import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { publishVersion, PublishVersionInputSchema } from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const POST = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const body = await req.json();
    const parsed = PublishVersionInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await publishVersion(versionId, parsed.data.changeSummary, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type_version.published',
        entityType: 'business_type_version',
        entityId: versionId,
        afterSnapshot: { changeSummary: parsed.data.changeSummary },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: result });
    } catch (err) {
      const error = err as Error & { validationResult?: unknown };
      if (error.message === 'PUBLISH_VALIDATION_FAILED') {
        return NextResponse.json(
          {
            error: {
              code: 'PUBLISH_VALIDATION_FAILED',
              message: 'Template has validation errors',
              details: error.validationResult,
            },
          },
          { status: 422 },
        );
      }
      if (error.message === 'NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, { status: 404 });
      }
      if (error.message === 'NOT_DRAFT') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Only draft versions can be published' } }, { status: 409 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
