import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { fnbCourseDefinitions } from '@oppsera/db';

export interface CourseDefinitionItem {
  id: string;
  courseNumber: number;
  courseName: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ListCourseDefinitionsInput {
  tenantId: string;
  locationId: string;
}

/**
 * List all course definitions for a location, ordered by course number.
 */
export async function listCourseDefinitions(input: ListCourseDefinitionsInput): Promise<CourseDefinitionItem[]> {
  const { tenantId, locationId } = input;

  const rows = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: fnbCourseDefinitions.id,
        courseNumber: fnbCourseDefinitions.courseNumber,
        courseName: fnbCourseDefinitions.courseName,
        sortOrder: fnbCourseDefinitions.sortOrder,
        isActive: fnbCourseDefinitions.isActive,
      })
      .from(fnbCourseDefinitions)
      .where(and(
        eq(fnbCourseDefinitions.tenantId, tenantId),
        eq(fnbCourseDefinitions.locationId, locationId),
      ))
      .orderBy(fnbCourseDefinitions.courseNumber);
  });

  return rows;
}
