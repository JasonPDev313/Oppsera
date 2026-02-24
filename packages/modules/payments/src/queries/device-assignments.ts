import { withTenant } from '@oppsera/db';
import { terminalDeviceAssignments } from '@oppsera/db';
import { terminals } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export interface DeviceAssignmentInfo {
  id: string;
  terminalId: string;
  terminalName: string;
  providerId: string;
  hsn: string;
  deviceModel: string | null;
  deviceLabel: string | null;
  isActive: boolean;
  lastConnectedAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * List all device assignments for a tenant, optionally filtered by provider.
 */
export async function listDeviceAssignments(
  tenantId: string,
  providerId?: string,
): Promise<DeviceAssignmentInfo[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(terminalDeviceAssignments.tenantId, tenantId),
      eq(terminalDeviceAssignments.isActive, true),
    ];
    if (providerId) {
      conditions.push(eq(terminalDeviceAssignments.providerId, providerId));
    }

    const rows = await tx
      .select({
        id: terminalDeviceAssignments.id,
        terminalId: terminalDeviceAssignments.terminalId,
        terminalName: terminals.terminalNumber,
        providerId: terminalDeviceAssignments.providerId,
        hsn: terminalDeviceAssignments.hsn,
        deviceModel: terminalDeviceAssignments.deviceModel,
        deviceLabel: terminalDeviceAssignments.deviceLabel,
        isActive: terminalDeviceAssignments.isActive,
        lastConnectedAt: terminalDeviceAssignments.lastConnectedAt,
        lastStatus: terminalDeviceAssignments.lastStatus,
        createdAt: terminalDeviceAssignments.createdAt,
        updatedAt: terminalDeviceAssignments.updatedAt,
      })
      .from(terminalDeviceAssignments)
      .leftJoin(terminals, eq(terminalDeviceAssignments.terminalId, terminals.id))
      .where(and(...conditions));

    return rows.map((r) => ({
      id: r.id,
      terminalId: r.terminalId,
      terminalName: r.terminalName != null ? String(r.terminalName) : 'Unknown',
      providerId: r.providerId,
      hsn: r.hsn,
      deviceModel: r.deviceModel,
      deviceLabel: r.deviceLabel,
      isActive: r.isActive,
      lastConnectedAt: r.lastConnectedAt?.toISOString() ?? null,
      lastStatus: r.lastStatus,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

/**
 * Get the device assignment for a specific terminal.
 */
export async function getDeviceAssignment(
  tenantId: string,
  terminalId: string,
): Promise<DeviceAssignmentInfo | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: terminalDeviceAssignments.id,
        terminalId: terminalDeviceAssignments.terminalId,
        terminalName: terminals.terminalNumber,
        providerId: terminalDeviceAssignments.providerId,
        hsn: terminalDeviceAssignments.hsn,
        deviceModel: terminalDeviceAssignments.deviceModel,
        deviceLabel: terminalDeviceAssignments.deviceLabel,
        isActive: terminalDeviceAssignments.isActive,
        lastConnectedAt: terminalDeviceAssignments.lastConnectedAt,
        lastStatus: terminalDeviceAssignments.lastStatus,
        createdAt: terminalDeviceAssignments.createdAt,
        updatedAt: terminalDeviceAssignments.updatedAt,
      })
      .from(terminalDeviceAssignments)
      .leftJoin(terminals, eq(terminalDeviceAssignments.terminalId, terminals.id))
      .where(
        and(
          eq(terminalDeviceAssignments.tenantId, tenantId),
          eq(terminalDeviceAssignments.terminalId, terminalId),
          eq(terminalDeviceAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      terminalId: row.terminalId,
      terminalName: row.terminalName != null ? String(row.terminalName) : 'Unknown',
      providerId: row.providerId,
      hsn: row.hsn,
      deviceModel: row.deviceModel,
      deviceLabel: row.deviceLabel,
      isActive: row.isActive,
      lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
      lastStatus: row.lastStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/**
 * Look up a device assignment by HSN.
 */
export async function getDeviceByHsn(
  tenantId: string,
  hsn: string,
): Promise<DeviceAssignmentInfo | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: terminalDeviceAssignments.id,
        terminalId: terminalDeviceAssignments.terminalId,
        terminalName: terminals.terminalNumber,
        providerId: terminalDeviceAssignments.providerId,
        hsn: terminalDeviceAssignments.hsn,
        deviceModel: terminalDeviceAssignments.deviceModel,
        deviceLabel: terminalDeviceAssignments.deviceLabel,
        isActive: terminalDeviceAssignments.isActive,
        lastConnectedAt: terminalDeviceAssignments.lastConnectedAt,
        lastStatus: terminalDeviceAssignments.lastStatus,
        createdAt: terminalDeviceAssignments.createdAt,
        updatedAt: terminalDeviceAssignments.updatedAt,
      })
      .from(terminalDeviceAssignments)
      .leftJoin(terminals, eq(terminalDeviceAssignments.terminalId, terminals.id))
      .where(
        and(
          eq(terminalDeviceAssignments.tenantId, tenantId),
          eq(terminalDeviceAssignments.hsn, hsn),
          eq(terminalDeviceAssignments.isActive, true),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      terminalId: row.terminalId,
      terminalName: row.terminalName != null ? String(row.terminalName) : 'Unknown',
      providerId: row.providerId,
      hsn: row.hsn,
      deviceModel: row.deviceModel,
      deviceLabel: row.deviceLabel,
      isActive: row.isActive,
      lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
      lastStatus: row.lastStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
