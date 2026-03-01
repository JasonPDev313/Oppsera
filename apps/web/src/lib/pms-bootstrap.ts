import { setPmsReadApi } from '@oppsera/core/helpers/pms-read-api';
import type { PmsReadApi } from '@oppsera/core/helpers/pms-read-api';
import { setPmsWriteApi } from '@oppsera/core/helpers/pms-write-api';
import type { PmsWriteApi } from '@oppsera/core/helpers/pms-write-api';
import type { RequestContext } from '@oppsera/core/auth/context';

/**
 * Wire the PmsReadApi + PmsWriteApi singletons so the POS can
 * search guests and post folio charges without importing @oppsera/module-pms.
 *
 * PmsReadApi is on the POS hot path — wired in critical-path Promise.all.
 * PmsWriteApi is used by API routes for manual folio operations.
 */
export async function initializePmsApis(): Promise<void> {
  const pms = await import('@oppsera/module-pms');

  // ── Read API (POS hot path) ──────────────────────────────────────
  const readApi: PmsReadApi = {
    searchCheckedInGuests: (tenantId, query, locationId) =>
      pms.searchCheckedInGuestsForPOS(tenantId, query, locationId),

    getCheckedInGuestByRoom: (tenantId, roomNumber, locationId) =>
      pms.getCheckedInGuestByRoom(tenantId, roomNumber, locationId),

    getActiveFolioForGuest: (tenantId, guestId) =>
      pms.getActiveFolioForGuest(tenantId, guestId),

    getFolioSummaryForPOS: (tenantId, folioId) =>
      pms.getFolioSummaryForPOS(tenantId, folioId),
  };
  setPmsReadApi(readApi);

  // ── Write API (folio mutations from POS) ─────────────────────────
  const writeApi: PmsWriteApi = {
    postFolioCharge: async (tenantId, input) => {
      const ctx = buildSystemContext(tenantId);
      const result = await pms.postFolioEntry(ctx, input.folioId, {
        entryType: 'ROOM_CHARGE',
        description: input.description,
        amountCents: input.amountCents,
        sourceRef: input.sourceRef,
        clientRequestId: input.clientRequestId,
      });
      return { entryId: result.id };
    },

    postFolioPayment: async (tenantId, input) => {
      const ctx = buildSystemContext(tenantId);
      const result = await pms.postFolioEntry(ctx, input.folioId, {
        entryType: 'PAYMENT',
        description: input.description,
        amountCents: input.amountCents,
        sourceRef: input.sourceRef,
        clientRequestId: input.clientRequestId,
      });
      return { entryId: result.id };
    },
  };
  setPmsWriteApi(writeApi);
}

/** Build a synthetic RequestContext for system-initiated folio operations. */
function buildSystemContext(tenantId: string) {
  return {
    tenantId,
    locationId: null,
    user: { id: 'system', email: 'system@oppsera.com', name: 'System', tenantId, tenantStatus: 'active' as const, membershipStatus: 'none' as const },
    requestId: `pms-write-${Date.now()}`,
    isPlatformAdmin: false,
  } as unknown as RequestContext;
}
