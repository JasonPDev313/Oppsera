import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { bootstrapTenantAccounting } from '@oppsera/module-accounting';
import { z } from 'zod';

const bootstrapBodySchema = z.object({
  templateKey: z.string().min(1).optional(),
  stateName: z.string().min(1).optional(),
}).strict();

// POST /api/v1/accounting/bootstrap — bootstrap chart of accounts from template
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body = {};
    try { body = await request.json(); } catch { /* empty body uses default template */ }
    const parsed = bootstrapBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
        { status: 400 },
      );
    }
    try {
      const result = await bootstrapTenantAccounting(ctx, {
        templateKey: parsed.data.templateKey,
        stateName: parsed.data.stateName,
      });
      return NextResponse.json({ data: result }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bootstrap failed';
      // Distinguish schema errors (missing columns/tables) from constraint errors (duplicate data)
      const isSchemaError = message.includes('column') || message.includes('relation');
      console.error('[accounting/bootstrap] Error:', message);
      return NextResponse.json(
        { error: { code: 'BOOTSTRAP_ERROR', message: isSchemaError ? `Database schema mismatch — run pending migrations (pnpm db:migrate). Detail: ${message}` : message } },
        { status: isSchemaError ? 500 : 400 },
      );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
