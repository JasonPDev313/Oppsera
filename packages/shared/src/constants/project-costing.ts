/**
 * Project/Job Costing constants
 */

export const PROJECT_STATUSES = {
  active: { label: 'Active', description: 'Project is in progress' },
  completed: { label: 'Completed', description: 'Project work is finished' },
  closed: { label: 'Closed', description: 'Project is closed, no further GL postings allowed' },
  archived: { label: 'Archived', description: 'Project is archived and hidden from default views' },
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUSES;

export const TASK_STATUSES = {
  open: { label: 'Open', description: 'Task is available for work' },
  in_progress: { label: 'In Progress', description: 'Work is actively being done' },
  complete: { label: 'Complete', description: 'Task is finished' },
  closed: { label: 'Closed', description: 'Task is closed, no further changes' },
} as const;

export type TaskStatus = keyof typeof TASK_STATUSES;

export const PROJECT_TYPES = {
  custom: { label: 'Custom', description: 'Custom project or job' },
  renovation: { label: 'Renovation', description: 'Facility renovation or improvement' },
  event: { label: 'Event', description: 'Event planning and execution' },
  campaign: { label: 'Campaign', description: 'Marketing or promotional campaign' },
  maintenance: { label: 'Maintenance', description: 'Scheduled maintenance project' },
  construction: { label: 'Construction', description: 'New construction or build-out' },
  consulting: { label: 'Consulting', description: 'Consulting engagement' },
  internal: { label: 'Internal', description: 'Internal improvement initiative' },
} as const;

export type ProjectType = keyof typeof PROJECT_TYPES;

/** Project number prefix */
export const PROJECT_NUMBER_PREFIX = 'PJ';
