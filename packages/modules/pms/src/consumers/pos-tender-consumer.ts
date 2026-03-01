/**
 * PMS consumers for tender.recorded.v1
 *
 * Handles two POS → PMS flows:
 * 1. Room charge: POS cashier charges a guest's folio
 * 2. Folio settlement: Guest pays folio balance at POS
 *
 * Both extract folio context from tender metadata and call postFolioEntry.
 */
import type { RequestContext } from '@oppsera/core';
import { logger } from '@oppsera/core';
import type { EventEnvelope } from '@oppsera/shared';
import { TenderRecordedPayloadSchema } from '@oppsera/shared/types/event-payloads';
import { postFolioEntry } from '../commands/post-folio-entry';

// ── Synthetic context for system-initiated folio entries ─────────

function buildSystemContext(tenantId: string, locationId: string): RequestContext {
  return {
    tenantId,
    locationId,
    requestId: `pms-tender-consumer-${Date.now()}`,
    isPlatformAdmin: false,
    user: {
      id: 'system',
      email: 'system@oppsera.com',
      name: 'System',
      tenantId,
      tenantStatus: 'active' as const,
      membershipStatus: 'none' as const,
    },
  } as unknown as RequestContext;
}

// ── 1. Room Charge Tender ────────────────────────────────────────

export async function handleRoomChargeTender(envelope: EventEnvelope) {
  try {
    const parsed = TenderRecordedPayloadSchema.safeParse(envelope.data);
    if (!parsed.success) {
      logger.error('[pms-pos] Invalid tender.recorded.v1 payload', { errors: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    if (data.tenderType !== 'room_charge') return;

    const metadata = data.metadata as Record<string, unknown> | null;
    const folioId = metadata?.folioId as string | undefined;
    const _guestId = metadata?.guestId as string | undefined;
    const roomNumber = metadata?.roomNumber as string | undefined;

    if (!folioId) {
      logger.error('[pms-pos] room_charge tender missing folioId in metadata', {
        tenderId: data.tenderId,
        orderId: data.orderId,
      });
      return;
    }

    const ctx = buildSystemContext(envelope.tenantId, data.locationId);

    const description = roomNumber
      ? `POS charge to room ${roomNumber}`
      : 'POS room charge';

    await postFolioEntry(ctx, folioId, {
      entryType: 'ROOM_CHARGE',
      description,
      amountCents: data.amount,
      sourceRef: `pos-tender:${data.tenderId}`,
      clientRequestId: `pms-room-charge-${data.tenderId}`,
    });

    logger.info('[pms-pos] Room charge posted to folio', {
      tenderId: data.tenderId,
      folioId,
      amountCents: data.amount,
      roomNumber,
    });
  } catch (err) {
    logger.error('[pms-pos] Failed to post room charge to folio', {
      error: { message: err instanceof Error ? err.message : String(err) },
      data: envelope.data,
    });
  }
}

// ── 2. Folio Settlement Tender ───────────────────────────────────

export async function handleFolioSettlementTender(envelope: EventEnvelope) {
  try {
    const parsed = TenderRecordedPayloadSchema.safeParse(envelope.data);
    if (!parsed.success) {
      logger.error('[pms-pos] Invalid tender.recorded.v1 payload', { errors: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    if (data.tenderType !== 'folio_settlement') return;

    const metadata = data.metadata as Record<string, unknown> | null;
    const folioId = metadata?.folioId as string | undefined;

    if (!folioId) {
      logger.error('[pms-pos] folio_settlement tender missing folioId in metadata', {
        tenderId: data.tenderId,
        orderId: data.orderId,
      });
      return;
    }

    const ctx = buildSystemContext(envelope.tenantId, data.locationId);

    await postFolioEntry(ctx, folioId, {
      entryType: 'PAYMENT',
      description: `POS payment — Order #${data.orderNumber}`,
      amountCents: data.amount,
      sourceRef: `pos-tender:${data.tenderId}`,
      clientRequestId: `pms-folio-settlement-${data.tenderId}`,
    });

    logger.info('[pms-pos] Folio settlement payment posted', {
      tenderId: data.tenderId,
      folioId,
      amountCents: data.amount,
    });
  } catch (err) {
    logger.error('[pms-pos] Failed to post folio settlement payment', {
      error: { message: err instanceof Error ? err.message : String(err) },
      data: envelope.data,
    });
  }
}
