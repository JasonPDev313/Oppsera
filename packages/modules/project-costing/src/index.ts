export const MODULE_KEY = 'project_costing';
export const MODULE_NAME = 'Project Costing';
export const MODULE_VERSION = '0.1.0';

// Validation
export * from './validation';

// Commands
export { createProject } from './commands/create-project';
export { updateProject } from './commands/update-project';
export { archiveProject, unarchiveProject } from './commands/archive-project';
export { closeProject } from './commands/close-project';
export { createTask } from './commands/create-task';
export { updateTask } from './commands/update-task';
export { closeTask } from './commands/close-task';

// Queries
export { listProjects } from './queries/list-projects';
export { getProject } from './queries/get-project';
export { getProjectProfitability } from './queries/get-project-profitability';
export { getProjectCostDetail } from './queries/get-project-cost-detail';
export { listTasks } from './queries/list-tasks';

// Consumers
export { handleGlEntryPostedForProjectCost } from './consumers/gl-entry-posted';
