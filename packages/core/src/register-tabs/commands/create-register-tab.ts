import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { generateUlid } from '@oppsera/shared';
import { registerTabs } from '@oppsera/db';
import type { CreateRegisterTabInput } from '../validation';
import type { RegisterTabRow } from '../types';

export async function createRegisterTab(
  ctx: RequestContext,
  input: CreateRegisterTabInput,
): Promise<RegisterTabRow> {
  const resolvedEmployeeId = input.employeeId ?? ctx.user.id;
  const resolvedEmployeeName = input.employeeName ?? ctx.user.name;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [row] = await tx
      .insert(registerTabs)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        terminalId: input.terminalId,
        tabNumber: input.tabNumber,
        label: input.label ?? null,
        orderId: null,
        employeeId: resolvedEmployeeId,
        employeeName: resolvedEmployeeName,
        locationId: input.locationId ?? ctx.locationId ?? null,
        deviceId: input.deviceId ?? null,
        version: 1,
        status: 'active',
      })
      .returning();

    const event = buildEventFromContext(
      ctx,
      'pos.register_tab.created.v1',
      {
        tabId: row!.id,
        terminalId: input.terminalId,
        tabNumber: input.tabNumber,
        employeeId: resolvedEmployeeId,
        employeeName: resolvedEmployeeName,
        locationId: input.locationId ?? ctx.locationId ?? null,
      },
    );

    return { result: row!, events: [event] };
  });

  await auditLog(ctx, 'register_tab.created', 'register_tab', result.id, undefined, {
    terminalId: input.terminalId,
    tabNumber: input.tabNumber,
    employeeId: resolvedEmployeeId,
    employeeName: resolvedEmployeeName,
  });

  return result as RegisterTabRow;
}
