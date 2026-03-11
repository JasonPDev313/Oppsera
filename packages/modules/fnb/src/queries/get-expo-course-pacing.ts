import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CoursePacingEntry {
  tabId: string;
  tableNumber: number | null;
  serverName: string | null;
  courseNumber: number;
  courseName: string;
  courseStatus: string; // unsent | sent | fired
  firedAt: string | null;
  /** Total non-voided items in this course across all stations */
  totalItems: number;
  /** Items that are ready or served */
  readyItems: number;
  /** True when all items in the course are ready/served */
  allReady: boolean;
  /** Seconds since course was fired (null if not fired) */
  elapsedSinceFired: number | null;
}

export interface TableCoursePacing {
  tabId: string;
  tableNumber: number | null;
  serverName: string | null;
  courses: CoursePacingEntry[];
  /** Number of the current course being prepared (lowest non-completed course) */
  currentCourseNumber: number | null;
  /** Number of completed courses (all items ready/served) */
  completedCourseCount: number;
  totalCourseCount: number;
}

export interface ExpoCoursePacingView {
  tables: TableCoursePacing[];
}

export interface GetExpoCoursePacingInput {
  tenantId: string;
  locationId: string;
  businessDate: string;
}

/**
 * Course pacing view for expo — shows per-table course progression.
 * Designed for restaurants using multi-course dining where expo needs
 * to track which courses are ready before firing the next one.
 */
export async function getExpoCoursePacing(
  input: GetExpoCoursePacingInput,
): Promise<ExpoCoursePacingView> {
  return withTenant(input.tenantId, async (tx) => {
    // Get all active tickets with course info, grouped by tab
    const rows = await tx.execute(sql`
      SELECT
        tc.tab_id,
        t.table_number,
        t.server_name,
        tc.course_number,
        tc.course_name,
        tc.course_status,
        tc.fired_at,
        CASE WHEN tc.fired_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (NOW() - tc.fired_at))::integer
          ELSE NULL
        END AS elapsed_since_fired,
        COUNT(kti.id) FILTER (WHERE kti.item_status NOT IN ('voided'))::int AS total_items,
        COUNT(kti.id) FILTER (WHERE kti.item_status IN ('ready', 'served'))::int AS ready_items
      FROM fnb_tab_courses tc
      INNER JOIN fnb_tabs t ON t.id = tc.tab_id AND t.tenant_id = tc.tenant_id
      LEFT JOIN fnb_kitchen_tickets kt ON kt.tab_id = tc.tab_id
        AND kt.tenant_id = tc.tenant_id
        AND kt.course_number = tc.course_number
        AND kt.status NOT IN ('voided')
      LEFT JOIN fnb_kitchen_ticket_items kti ON kti.ticket_id = kt.id
      WHERE tc.tenant_id = ${input.tenantId}
        AND t.location_id = ${input.locationId}
        AND t.status NOT IN ('closed', 'voided')
        AND t.business_date = ${input.businessDate}
      GROUP BY tc.tab_id, t.table_number, t.server_name,
               tc.course_number, tc.course_name, tc.course_status, tc.fired_at
      ORDER BY tc.tab_id, tc.course_number ASC
    `);

    const tabMap = new Map<string, {
      tableNumber: number | null;
      serverName: string | null;
      courses: CoursePacingEntry[];
    }>();

    for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
      const tabId = r.tab_id as string;
      if (!tabId) continue;

      if (!tabMap.has(tabId)) {
        tabMap.set(tabId, {
          tableNumber: r.table_number != null ? Number(r.table_number) : null,
          serverName: (r.server_name as string) ?? null,
          courses: [],
        });
      }

      const totalItems = Number(r.total_items ?? 0);
      const readyItems = Number(r.ready_items ?? 0);

      tabMap.get(tabId)!.courses.push({
        tabId,
        tableNumber: r.table_number != null ? Number(r.table_number) : null,
        serverName: (r.server_name as string) ?? null,
        courseNumber: Number(r.course_number),
        courseName: (r.course_name as string) ?? `Course ${r.course_number}`,
        courseStatus: (r.course_status as string) ?? 'unsent',
        firedAt: (r.fired_at as string) ?? null,
        totalItems,
        readyItems,
        allReady: totalItems > 0 && readyItems === totalItems,
        elapsedSinceFired: r.elapsed_since_fired != null ? Number(r.elapsed_since_fired) : null,
      });
    }

    const tables: TableCoursePacing[] = [];
    for (const [tabId, data] of tabMap) {
      const completedCount = data.courses.filter((c) => c.allReady).length;
      const currentCourse = data.courses.find((c) => !c.allReady);

      tables.push({
        tabId,
        tableNumber: data.tableNumber,
        serverName: data.serverName,
        courses: data.courses,
        currentCourseNumber: currentCourse?.courseNumber ?? null,
        completedCourseCount: completedCount,
        totalCourseCount: data.courses.length,
      });
    }

    return { tables };
  });
}
