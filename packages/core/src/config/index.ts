export interface ConfigService {
  get<T>(
    tenantId: string,
    moduleKey: string,
    settingKey: string,
    locationId?: string,
  ): Promise<T | null>;
  set(
    tenantId: string,
    moduleKey: string,
    settingKey: string,
    value: unknown,
    locationId?: string,
  ): Promise<void>;
  // Resolution: location-specific -> tenant-wide -> platform default
}

// TODO: Implement later
