import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

// ── Validation ────────────────────────────────────────────────────────

const CreateProactiveRuleSchema = z.object({
  triggerType: z.string().min(1),
  triggerConfig: z.record(z.unknown()).optional().default({}),
  messageTemplate: z.string().min(1),
  moduleKey: z.string().nullable().optional(),
  routePattern: z.string().nullable().optional(),
  priority: z.number().int().optional().default(0),
  enabled: z.enum(['true', 'false']).optional().default('true'),
  maxShowsPerUser: z.number().int().positive().optional().default(1),
  cooldownHours: z.number().int().nonnegative().optional().default(24),
  tenantId: z.string().nullable().optional(),
});

type CreateProactiveRuleInput = z.infer<typeof CreateProactiveRuleSchema>;

// ── GET /api/v1/ai-support/proactive-rules ────────────────────────────
// List all proactive rules ordered by priority DESC

export const GET = withAdminPermission(async (_req: NextRequest) => {
  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT
        id, tenant_id, trigger_type, trigger_config, message_template,
        module_key, route_pattern, priority, enabled,
        max_shows_per_user, cooldown_hours,
        created_at, updated_at
      FROM ai_support_proactive_rules
      ORDER BY priority DESC, created_at DESC
      LIMIT 200
    `),
  );

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r['id'] as string,
    tenantId: (r['tenant_id'] as string | null) ?? null,
    triggerType: r['trigger_type'] as string,
    triggerConfig: r['trigger_config'] ?? {},
    messageTemplate: r['message_template'] as string,
    moduleKey: (r['module_key'] as string | null) ?? null,
    routePattern: (r['route_pattern'] as string | null) ?? null,
    priority: Number(r['priority']),
    enabled: r['enabled'] as string,
    maxShowsPerUser: Number(r['max_shows_per_user']),
    cooldownHours: Number(r['cooldown_hours']),
    createdAt: ts(r['created_at']),
    updatedAt: ts(r['updated_at']),
  }));

  return NextResponse.json({ data: { items } });
}, { permission: 'ai_support.answers.read' });

// ── POST /api/v1/ai-support/proactive-rules ───────────────────────────
// Create a new proactive rule

export const POST = withAdminPermission(async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = CreateProactiveRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          issues: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const data: CreateProactiveRuleInput = parsed.data;
  const id = generateUlid();
  const triggerConfigJson = JSON.stringify(data.triggerConfig ?? {});

  const rows = await withAdminDb(async (tx) =>
    tx.execute(sql`
      INSERT INTO ai_support_proactive_rules (
        id, tenant_id, trigger_type, trigger_config, message_template,
        module_key, route_pattern, priority, enabled,
        max_shows_per_user, cooldown_hours,
        created_at, updated_at
      )
      VALUES (
        ${id},
        ${data.tenantId ?? null},
        ${data.triggerType},
        ${triggerConfigJson}::jsonb,
        ${data.messageTemplate},
        ${data.moduleKey ?? null},
        ${data.routePattern ?? null},
        ${data.priority},
        ${data.enabled},
        ${data.maxShowsPerUser},
        ${data.cooldownHours},
        NOW(), NOW()
      )
      RETURNING
        id, tenant_id, trigger_type, trigger_config, message_template,
        module_key, route_pattern, priority, enabled,
        max_shows_per_user, cooldown_hours,
        created_at, updated_at
    `),
  );

  const ts = (v: unknown) =>
    v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const arr = Array.from(rows as Iterable<Record<string, unknown>>);
  const r = arr[0]!;

  return NextResponse.json(
    {
      data: {
        id: r['id'] as string,
        tenantId: (r['tenant_id'] as string | null) ?? null,
        triggerType: r['trigger_type'] as string,
        triggerConfig: r['trigger_config'] ?? {},
        messageTemplate: r['message_template'] as string,
        moduleKey: (r['module_key'] as string | null) ?? null,
        routePattern: (r['route_pattern'] as string | null) ?? null,
        priority: Number(r['priority']),
        enabled: r['enabled'] as string,
        maxShowsPerUser: Number(r['max_shows_per_user']),
        cooldownHours: Number(r['cooldown_hours']),
        createdAt: ts(r['created_at']),
        updatedAt: ts(r['updated_at']),
      },
    },
    { status: 201 },
  );
}, { permission: 'ai_support.answers.write' });
