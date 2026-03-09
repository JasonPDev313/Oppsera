import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbKdsLocationSettings } from '@oppsera/db';

export interface KdsLocationSettings {
  id: string;
  staleTicketMode: 'persist' | 'auto_clear';
  autoClearTime: string;
}

const DEFAULTS: Omit<KdsLocationSettings, 'id'> = {
  staleTicketMode: 'persist',
  autoClearTime: '04:00',
};

export async function getKdsLocationSettings(
  tenantId: string,
  locationId: string,
): Promise<KdsLocationSettings> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(fnbKdsLocationSettings)
      .where(and(
        eq(fnbKdsLocationSettings.tenantId, tenantId),
        eq(fnbKdsLocationSettings.locationId, locationId),
      ))
      .limit(1);

    if (!row) {
      return { id: '', ...DEFAULTS };
    }

    return {
      id: row.id,
      staleTicketMode: row.staleTicketMode as 'persist' | 'auto_clear',
      autoClearTime: row.autoClearTime ?? '04:00',
    };
  });
}
