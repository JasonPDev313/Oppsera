import { NextResponse } from 'next/server';

import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  listBusinessTypes,
  createBusinessType,
  CreateBusinessTypeInputSchema,
} from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

// ── GET /api/v1/admin/business-types ────────────────────────────

export const GET = withAdminPermission(
  async (req) => {
    const url = new URL(req.url);
    const filters = {
      search: url.searchParams.get('search') ?? undefined,
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      isActive: url.searchParams.has('isActive') ? url.searchParams.get('isActive') === 'true' : undefined,
      isSystem: url.searchParams.has('isSystem') ? url.searchParams.get('isSystem') === 'true' : undefined,
      showAtSignup: url.searchParams.has('showAtSignup') ? url.searchParams.get('showAtSignup') === 'true' : undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
    };

    const result = await listBusinessTypes(filters);
    return NextResponse.json(result);
  },
  { permission: 'system.business_types.view' },
);

// ── POST /api/v1/admin/business-types ───────────────────────────

export const POST = withAdminPermission(
  async (req, session) => {
    const body = await req.json();
    const parsed = CreateBusinessTypeInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }

    try {
      const result = await createBusinessType(parsed.data, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type.created',
        entityType: 'business_type',
        entityId: result.businessType.id,
        afterSnapshot: { name: parsed.data.name, slug: parsed.data.slug },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: result }, { status: 201 });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'SLUG_CONFLICT') {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: 'A business type with this slug already exists' } },
          { status: 409 },
        );
      }
      if (msg === 'INVALID_CATEGORY') {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'The specified category does not exist' } },
          { status: 400 },
        );
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
