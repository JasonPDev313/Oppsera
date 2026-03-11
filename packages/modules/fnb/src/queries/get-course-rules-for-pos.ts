import { batchResolveCourseRules } from '../helpers/resolve-course-rule';
import type { BatchCourseRuleResult } from '../helpers/resolve-course-rule';

export interface GetCourseRulesForPosInput {
  tenantId: string;
  locationId: string;
}

/**
 * Get all effective course rules for F&B items at a location.
 * Returns a map of itemId → effective course rule.
 * Called at POS startup alongside catalog load.
 */
export async function getCourseRulesForPos(input: GetCourseRulesForPosInput): Promise<BatchCourseRuleResult> {
  return batchResolveCourseRules(input.tenantId, input.locationId);
}
