import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { storedValueInstruments } from '@oppsera/db';

export interface GetStoredValueInstrumentsInput {
  tenantId: string;
  customerId: string;
  instrumentType?: string;
  status?: string;
}

export interface StoredValueInstrumentSummary {
  id: string;
  instrumentType: string;
  code: string;
  status: string;
  initialValueCents: number;
  currentBalanceCents: number;
  unitCount: number | null;
  unitsRemaining: number | null;
  description: string | null;
  expiresAt: string | null;
  issuedBy: string | null;
  createdAt: string;
}

export async function getStoredValueInstruments(
  input: GetStoredValueInstrumentsInput,
): Promise<{ instruments: StoredValueInstrumentSummary[] }> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions = [
      eq(storedValueInstruments.tenantId, input.tenantId),
      eq(storedValueInstruments.customerId, input.customerId),
    ];

    if (input.instrumentType) {
      conditions.push(eq(storedValueInstruments.instrumentType, input.instrumentType));
    }

    if (input.status) {
      conditions.push(eq(storedValueInstruments.status, input.status));
    }

    const rows = await tx
      .select({
        id: storedValueInstruments.id,
        instrumentType: storedValueInstruments.instrumentType,
        code: storedValueInstruments.code,
        status: storedValueInstruments.status,
        initialValueCents: storedValueInstruments.initialValueCents,
        currentBalanceCents: storedValueInstruments.currentBalanceCents,
        unitCount: storedValueInstruments.unitCount,
        unitsRemaining: storedValueInstruments.unitsRemaining,
        description: storedValueInstruments.description,
        expiresAt: storedValueInstruments.expiresAt,
        issuedBy: storedValueInstruments.issuedBy,
        createdAt: storedValueInstruments.createdAt,
      })
      .from(storedValueInstruments)
      .where(and(...conditions));

    const instruments: StoredValueInstrumentSummary[] = rows.map((row) => ({
      id: row.id,
      instrumentType: row.instrumentType,
      code: row.code,
      status: row.status,
      initialValueCents: row.initialValueCents,
      currentBalanceCents: row.currentBalanceCents,
      unitCount: row.unitCount ?? null,
      unitsRemaining: row.unitsRemaining ?? null,
      description: row.description ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      issuedBy: row.issuedBy ?? null,
      createdAt: row.createdAt.toISOString(),
    }));

    return { instruments };
  });
}
