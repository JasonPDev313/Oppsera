import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getWorkflowConfig,
  setWorkflowConfig,
  validateWorkflowOverride,
  updateWorkflowConfigSchema,
} from '@oppsera/core/erp';

function extractParams(request: NextRequest): { moduleKey: string; workflowKey: string } {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/erp/config/[moduleKey]/[workflowKey]
  return {
    workflowKey: parts[parts.length - 1]!,
    moduleKey: parts[parts.length - 2]!,
  };
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { moduleKey, workflowKey } = extractParams(request);
    const config = await getWorkflowConfig(ctx.tenantId, moduleKey, workflowKey);
    return NextResponse.json({ data: config });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { moduleKey, workflowKey } = extractParams(request);
    const body = await request.json();
    const parsed = updateWorkflowConfigSchema.safeParse({ ...body, moduleKey, workflowKey });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    // Validate SMB protection rules
    const validation = await validateWorkflowOverride(
      // tier is resolved inside the function
      'SMB' as any, // placeholder — function reads from DB
      moduleKey,
      workflowKey,
      {
        autoMode: parsed.data.autoMode,
        approvalRequired: parsed.data.approvalRequired,
        userVisible: parsed.data.userVisible,
      },
    );

    if (!validation.valid) {
      throw new ValidationError('Workflow override rejected', validation.warnings.map((w) => ({ field: 'workflow', message: w })));
    }

    await setWorkflowConfig(
      ctx.tenantId,
      moduleKey,
      workflowKey,
      {
        autoMode: parsed.data.autoMode,
        approvalRequired: parsed.data.approvalRequired,
        userVisible: parsed.data.userVisible,
        customSettings: parsed.data.customSettings,
      },
      ctx.user.id,
      parsed.data.reason,
    );

    const updated = await getWorkflowConfig(ctx.tenantId, moduleKey, workflowKey);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'platform_core', permission: 'settings.update', writeAccess: true },
);
