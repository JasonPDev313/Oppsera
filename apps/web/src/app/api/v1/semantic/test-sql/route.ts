import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, sql } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────

const testSqlSchema = z.object({
  rawSql: z.string().min(1).max(4000),
  limit: z.number().int().min(1).max(20).default(5),
});

// ── SQL safety check ──────────────────────────────────────────────
// Lightweight validation — blocks obvious DML/DDL. RLS is the real guard.

const BLOCKED_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i,
  /\b(SET\s+|COPY\s+|VACUUM|REINDEX|CLUSTER|COMMENT\s+ON)\b/i,
  /\bpg_sleep\b/i,
  /\bset_config\b/i,
  /\bcurrent_setting\b/i,
  /;\s*\S/, // multiple statements
];

function validateTestSql(rawSql: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(rawSql)) {
      return `SQL expression contains blocked pattern: ${pattern.source}`;
    }
  }
  return null;
}

// ── POST /api/v1/semantic/test-sql ────────────────────────────────
// Execute a raw SQL expression for testing in the authoring panel.
// Wraps the expression in a SELECT with LIMIT, scoped to tenant via RLS.

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = testSqlSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { rawSql, limit } = parsed.data;

    // Safety check
    const validationError = validateTestSql(rawSql);
    if (validationError) {
      return NextResponse.json(
        { error: { code: 'UNSAFE_SQL', message: validationError } },
        { status: 400 },
      );
    }

    try {
      const rows = await withTenant(ctx.tenantId, async (tx) => {
        // If the expression looks like a full SELECT, run it directly.
        // Otherwise wrap it as a column expression against rm_daily_sales.
        const isFullQuery = /^\s*SELECT\b/i.test(rawSql);
        const query = isFullQuery
          ? `${rawSql.replace(/;\s*$/, '')} LIMIT ${limit}`
          : `SELECT ${rawSql} AS result FROM rm_daily_sales WHERE tenant_id = (SELECT current_setting('app.current_tenant_id', true)) LIMIT ${limit}`;

        const result = await tx.execute(sql.raw(query));
        return Array.from(result as Iterable<Record<string, unknown>>);
      });

      return NextResponse.json({ data: { rows } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SQL execution failed';
      return NextResponse.json(
        { error: { code: 'SQL_ERROR', message } },
        { status: 400 },
      );
    }
  },
  { entitlement: 'semantic', permission: 'semantic.view', writeAccess: true },
);
