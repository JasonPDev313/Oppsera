import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateSection, updateSectionSchema } from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/sections/:id — update section
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    const sectionId = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateSectionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const section = await updateSection(ctx, sectionId, parsed.data);
    return NextResponse.json({ data: section });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage' , writeAccess: true },
);
