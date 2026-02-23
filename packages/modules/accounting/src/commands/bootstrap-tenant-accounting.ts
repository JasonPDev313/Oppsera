import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { bootstrapTenantCoa } from '../helpers/bootstrap-tenant-coa';

interface BootstrapInput {
  templateKey?: string; // 'retail_default', 'restaurant_default', 'golf_default', 'hybrid_default'
  stateName?: string;   // e.g., 'Michigan' — resolves [STATE_NAME] in account templates
}

export async function bootstrapTenantAccounting(
  ctx: RequestContext,
  input?: BootstrapInput,
) {
  // Normalize template key: 'golf' → 'golf_default', 'retail_default' → 'retail_default'
  const rawKey = input?.templateKey ?? 'retail_default';
  const templateKey = rawKey.endsWith('_default') ? rawKey : `${rawKey}_default`;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const counts = await bootstrapTenantCoa(tx, ctx.tenantId, templateKey, input?.stateName);

    return {
      result: {
        tenantId: ctx.tenantId,
        templateKey,
        ...counts,
      },
      events: [],
    };
  });

  await auditLog(ctx, 'accounting.tenant.bootstrapped', 'tenant', ctx.tenantId);
  return result;
}
