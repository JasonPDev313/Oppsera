import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { resolveCourseRule, resolveCourseRuleFromHierarchy, resolveCategoryHierarchy, resolveCourseRuleQuerySchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/course-rules/resolve?itemId=X&categoryId=Y
// Supports: itemId only, itemId+categoryId, or categoryId only (for new item preview)
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const itemId = url.searchParams.get('itemId') || undefined;
    const categoryId = url.searchParams.get('categoryId') || undefined;
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';

    const parsed = resolveCourseRuleQuerySchema.safeParse({ itemId, categoryId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    let resolved;
    if (parsed.data.itemId) {
      // Resolve from real item (with optional categoryId hint)
      resolved = await resolveCourseRule(
        ctx.tenantId,
        locationId,
        parsed.data.itemId,
        parsed.data.categoryId,
      );
    } else {
      // categoryId-only: preview mode for new items — walk the category's parent chain
      // so that sub-department and department rules are included in the preview
      const catId = parsed.data.categoryId ?? null;
      const hierarchy = catId
        ? await resolveCategoryHierarchy(ctx.tenantId, catId)
        : { categoryId: null, subDepartmentId: null, departmentId: null };
      resolved = await resolveCourseRuleFromHierarchy(
        ctx.tenantId,
        locationId,
        { itemId: '', ...hierarchy },
      );
    }
    return NextResponse.json({ data: resolved });
  },
  { entitlement: 'fnb', permission: 'fnb.view' },
);
