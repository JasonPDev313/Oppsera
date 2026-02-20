import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { floorPlanTemplatesV2 } from '../schema';

export interface TemplateDetail {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  snapshotJson: Record<string, unknown>;
  widthFt: string;
  heightFt: string;
  objectCount: number;
  totalCapacity: number;
  isSystemTemplate: boolean;
  thumbnailUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export async function getTemplate(tenantId: string, templateId: string): Promise<TemplateDetail> {
  return withTenant(tenantId, async (tx) => {
    const [template] = await tx
      .select()
      .from(floorPlanTemplatesV2)
      .where(and(eq(floorPlanTemplatesV2.id, templateId), eq(floorPlanTemplatesV2.tenantId, tenantId)))
      .limit(1);
    if (!template) throw new NotFoundError('Template', templateId);

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      snapshotJson: template.snapshotJson as Record<string, unknown>,
      widthFt: template.widthFt,
      heightFt: template.heightFt,
      objectCount: template.objectCount,
      totalCapacity: template.totalCapacity,
      isSystemTemplate: template.isSystemTemplate,
      thumbnailUrl: template.thumbnailUrl,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      createdBy: template.createdBy,
    };
  });
}
