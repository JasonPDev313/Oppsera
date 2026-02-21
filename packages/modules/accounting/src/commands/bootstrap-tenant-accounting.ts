import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { bootstrapTenantCoa } from '../helpers/bootstrap-tenant-coa';

interface BootstrapInput {
  templateKey?: string; // 'retail_default', 'restaurant_default', 'golf_default', 'hybrid_default'
}

export async function bootstrapTenantAccounting(
  ctx: RequestContext,
  input?: BootstrapInput,
) {
  const templateKey = input?.templateKey ?? 'retail_default';

  const result = await publishWithOutbox(ctx, async (tx) => {
    const counts = await bootstrapTenantCoa(tx, ctx.tenantId, templateKey);

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
