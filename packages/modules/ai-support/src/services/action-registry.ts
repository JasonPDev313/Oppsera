export interface ActionDefinition {
  name: string;
  description: string;
  requiredPermission: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  executor: (
    params: Record<string, unknown>,
    context: { tenantId: string; locationId?: string },
  ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
}

const registry = new Map<string, ActionDefinition>();

export function registerAction(def: ActionDefinition): void {
  registry.set(def.name, def);
}

export function getAction(name: string): ActionDefinition | undefined {
  return registry.get(name);
}

export function listActions(): ActionDefinition[] {
  return Array.from(registry.values());
}

/** Filter actions by user's permissions */
export function getAvailableActions(userPermissions: string[]): ActionDefinition[] {
  return listActions().filter(
    (a) =>
      userPermissions.includes(a.requiredPermission) || userPermissions.includes('*'),
  );
}

/** Convert actions to Claude tool_use format */
export function actionsToClaudeTools(actions: ActionDefinition[]): Array<{
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}> {
  return actions.map((a) => ({
    name: a.name,
    description: a.description,
    input_schema: a.parameters,
  }));
}
