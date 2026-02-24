import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { scoreDataQuality } from '@oppsera/module-semantic/intelligence';

// ── Validation ────────────────────────────────────────────────────

const dataQualitySchema = z.object({
  rowCount: z.number().int().min(0),
  executionTimeMs: z.number().min(0),
  dateRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  }).optional(),
  compiledSql: z.string().max(10000).optional(),
  compilationErrors: z.array(z.string()).max(50).optional(),
  llmConfidence: z.number().min(0).max(1).optional(),
  schemaTablesUsed: z.array(z.string()).max(50).optional(),
  totalRowsInTable: z.number().int().min(0).optional(),
  timedOut: z.boolean().optional(),
});

// ── POST /api/v1/semantic/data-quality ────────────────────────────
// Scores the quality of a semantic query result based on row count,
// execution time, date range coverage, compilation status, LLM
// confidence, schema coverage, and timeliness.
// Pure computation — no DB access.

export const POST = withMiddleware(
  async (request: NextRequest) => {
    const body = await request.json();
    const parsed = dataQualitySchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = scoreDataQuality(parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'semantic', permission: 'semantic.view' },
);
