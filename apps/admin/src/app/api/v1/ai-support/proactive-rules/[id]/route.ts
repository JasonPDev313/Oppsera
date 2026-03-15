import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from '@oppsera/db';

// ── Validation ────────────────────────────────────────────────────────

const PatchProactiveRuleSchema = z.object({
  triggerType: z.string().min(1).max(100).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  messageTemplate: z.string().min(1).max(4000).optional(),
  moduleKey: z.string().max(100).nullable().optional(),
  routePattern: z.string().max(500).nullable().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  enabled: z.enum(['true', 'false']).optional(),
  maxShowsPerUser: z.number().int().min(1).max(100).optional(),
  cooldownHours: z.number().int().min(0).max(8760).optional(),
  tenantId: z.string().max(30).nullable().optional(),
}).strict();

// ── PATCH /api/v1/ai-support/proactive-rules/[id] ────────────────────
// Update a proactive rule (partial update)

export const PATCH = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing id' } },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = PatchProactiveRuleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Validation failed', issues: parsed.error.issues } },
      { status: 400 },
    );
  }

  const body = parsed.data;

  // Verify rule exists
  const existing = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id FROM ai_support_proactive_rules WHERE id = ${id} LIMIT 1
    `),
  );
  if (Array.from(existing as Iterable<unknown>).length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Proactive rule ${id} not found` } },
      { status: 404 },
    );
  }

  // Build SET clause from provided fields
  const setParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

  if (body.triggerType !== undefined) {
    setParts.push(sql`trigger_type = ${body.triggerType}`);
  }
  if (body.triggerConfig !== undefined) {
    setParts.push(sql`trigger_config = ${JSON.stringify(body.triggerConfig)}::jsonb`);
  }
  if (body.messageTemplate !== undefined) {
    setParts.push(sql`message_template = ${body.messageTemplate}`);
  }
  if (body.moduleKey !== undefined) {
    setParts.push(sql`module_key = ${body.moduleKey ?? null}`);
  }
  if (body.routePattern !== undefined) {
    setParts.push(sql`route_pattern = ${body.routePattern ?? null}`);
  }
  if (body.priority !== undefined) {
    setParts.push(sql`priority = ${body.priority}`);
  }
  if (body.enabled !== undefined) {
    setParts.push(sql`enabled = ${body.enabled}`);
  }
  if (body.maxShowsPerUser !== undefined) {
    setParts.push(sql`max_shows_per_user = ${body.maxShowsPerUser}`);
  }
  if (body.cooldownHours !== undefined) {
    setParts.push(sql`cooldown_hours = ${body.cooldownHours}`);
  }
  if (body.tenantId !== undefined) {
    setParts.push(sql`tenant_id = ${body.tenantId ?? null}`);
  }

  await withAdminDb(async (tx) =>
    tx.execute(sql`
      UPDATE ai_support_proactive_rules
      SET ${sql.join(setParts, sql`, `)}
      WHERE id = ${id}
    `),
  );

  return NextResponse.json({ data: { id, updated: true } });
}, { permission: 'ai_support.answers.write' });

// ── DELETE /api/v1/ai-support/proactive-rules/[id] ───────────────────
// Delete a proactive rule

export const DELETE = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing id' } },
      { status: 400 },
    );
  }

  // Verify rule exists
  const existing = await withAdminDb(async (tx) =>
    tx.execute(sql`
      SELECT id FROM ai_support_proactive_rules WHERE id = ${id} LIMIT 1
    `),
  );
  if (Array.from(existing as Iterable<unknown>).length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Proactive rule ${id} not found` } },
      { status: 404 },
    );
  }

  await withAdminDb(async (tx) =>
    tx.execute(sql`
      DELETE FROM ai_support_proactive_rules WHERE id = ${id}
    `),
  );

  return NextResponse.json({ data: { id, deleted: true } });
}, { permission: 'ai_support.answers.write' });
