import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAdminAuth } from '@/lib/with-admin-auth';
import {
  getNarrativeConfigFull,
  updateNarrativeConfig,
  resetNarrativeConfig,
  invalidateNarrativeConfigCache,
  getDefaultPromptTemplate,
} from '@oppsera/module-semantic';

// ── Validation ────────────────────────────────────────────────────

const REQUIRED_PLACEHOLDERS = ['{{INDUSTRY_HINT}}', '{{LENS_SECTION}}', '{{METRIC_SECTION}}'] as const;

const updateSchema = z.object({
  promptTemplate: z.string().min(100, 'Prompt template must be at least 100 characters').max(20000, 'Prompt template must be under 20,000 characters'),
});

// ── GET /api/v1/eval/narrative ────────────────────────────────────

export const GET = withAdminAuth(async () => {
  const config = await getNarrativeConfigFull();
  const defaultTemplate = getDefaultPromptTemplate();

  return NextResponse.json({
    data: {
      promptTemplate: config?.promptTemplate ?? null,
      defaultTemplate,
      updatedAt: config?.updatedAt ?? null,
      updatedBy: config?.updatedBy ?? null,
      isCustom: config !== null,
    },
  });
}, 'viewer');

// ── PATCH /api/v1/eval/narrative ──────────────────────────────────

export const PATCH = withAdminAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; ') } },
      { status: 400 },
    );
  }

  // Validate required placeholders are present
  const missing = REQUIRED_PLACEHOLDERS.filter((p) => !parsed.data.promptTemplate.includes(p));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: { code: 'MISSING_PLACEHOLDERS', message: `Template must contain these placeholders: ${missing.join(', ')}` } },
      { status: 400 },
    );
  }

  await updateNarrativeConfig(parsed.data.promptTemplate, session.email);
  const config = await getNarrativeConfigFull();

  return NextResponse.json({
    data: {
      promptTemplate: config?.promptTemplate ?? null,
      defaultTemplate: getDefaultPromptTemplate(),
      updatedAt: config?.updatedAt ?? null,
      updatedBy: config?.updatedBy ?? null,
      isCustom: true,
    },
  });
}, 'admin');

// ── DELETE /api/v1/eval/narrative ─────────────────────────────────

export const DELETE = withAdminAuth(async () => {
  await resetNarrativeConfig();
  invalidateNarrativeConfigCache();

  return NextResponse.json({
    data: {
      promptTemplate: null,
      defaultTemplate: getDefaultPromptTemplate(),
      updatedAt: null,
      updatedBy: null,
      isCustom: false,
    },
  });
}, 'admin');
