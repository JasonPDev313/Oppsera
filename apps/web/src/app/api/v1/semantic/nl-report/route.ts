import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { buildReportFromNL } from '@oppsera/module-semantic/intelligence/nl-report-builder';
import { getFieldCatalog } from '@oppsera/module-reporting';

// ── Validation ────────────────────────────────────────────────────

const nlReportSchema = z.object({
  description: z.string().min(1).max(2000),
});

// ── POST /api/v1/semantic/nl-report ───────────────────────────────
// Translates a free-form text description into a structured report
// definition using the reporting module's field catalog as the source
// of truth. Returns a draft report ready for persistence via saveReport().

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = nlReportSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { description } = parsed.data;

    // Fetch the field catalog from the reporting module
    const fieldCatalogRows = await getFieldCatalog();

    // Map to the shape expected by buildReportFromNL
    const fieldCatalog = fieldCatalogRows.map((f) => ({
      slug: f.fieldKey,
      displayName: f.label,
      fieldType: (f.isMetric ? 'measure' : 'dimension') as 'dimension' | 'measure',
      dataType: f.dataType,
    }));

    try {
      const result = await buildReportFromNL(
        ctx.tenantId,
        description,
        { fieldCatalog },
      );

      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[semantic/nl-report] Build error:', err);
      return NextResponse.json(
        { error: { code: 'NL_REPORT_ERROR', message: 'Unable to build report from description. Please try rephrasing.' } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
