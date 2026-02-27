import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { AlertEventConfig } from '../validation';

// ── Bump Bar Profile Types ──────────────────────────────────────

export interface BumpBarKeyMapping {
  buttonIndex: number;
  scanCode: number;
  action: string;
  label: string;
  color?: string;
}

export interface BumpBarProfileListItem {
  id: string;
  profileName: string;
  buttonCount: number;
  keyMappings: BumpBarKeyMapping[];
  isDefault: boolean;
  isActive: boolean;
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BumpBarProfileDetail = BumpBarProfileListItem;

// ── Alert Profile Types ─────────────────────────────────────────

export interface AlertProfileListItem {
  id: string;
  profileName: string;
  newTicketAlert: AlertEventConfig | null;
  warningAlert: AlertEventConfig | null;
  criticalAlert: AlertEventConfig | null;
  rushAlert: AlertEventConfig | null;
  allergyAlert: AlertEventConfig | null;
  modificationAlert: AlertEventConfig | null;
  completeAlert: AlertEventConfig | null;
  isDefault: boolean;
  isActive: boolean;
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AlertProfileDetail = AlertProfileListItem;

// ── Performance Target Types ────────────────────────────────────

export interface PerformanceTargetItem {
  id: string;
  stationId: string | null;
  stationName: string | null;
  orderType: string | null;
  targetPrepSeconds: number;
  warningPrepSeconds: number;
  criticalPrepSeconds: number;
  speedOfServiceGoalSeconds: number | null;
  isActive: boolean;
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Item Prep Time Types ────────────────────────────────────────

export interface ItemPrepTimeItem {
  id: string;
  catalogItemId: string;
  catalogItemName: string | null;
  stationId: string | null;
  stationName: string | null;
  estimatedPrepSeconds: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Composite KDS Station Settings Type ─────────────────────────

export interface KdsStationSettings {
  station: {
    id: string;
    name: string;
    displayName: string;
    stationType: string;
    color: string | null;
    sortOrder: number;
    warningThresholdSeconds: number;
    criticalThresholdSeconds: number;
    isActive: boolean;
  };
  displayConfig: {
    id: string;
    displayDeviceId: string | null;
    displayMode: string;
    columnsPerRow: number;
    sortBy: string;
    showModifiers: boolean;
    showSeatNumbers: boolean;
    showCourseHeaders: boolean;
    autoScrollEnabled: boolean;
    soundAlertEnabled: boolean;
  } | null;
  bumpBarProfile: BumpBarProfileListItem | null;
  alertProfile: AlertProfileListItem | null;
  performanceTargets: PerformanceTargetItem[];
  routingRules: {
    id: string;
    ruleType: string;
    catalogItemId: string | null;
    modifierId: string | null;
    departmentId: string | null;
    subDepartmentId: string | null;
    stationId: string;
    priority: number;
    isActive: boolean;
  }[];
}

// ── Bump Bar Profiles ───────────────────────────────────────────

export async function listBumpBarProfiles(input: {
  tenantId: string;
  locationId?: string;
}): Promise<BumpBarProfileListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`is_active = true`,
    ];

    if (input.locationId) {
      conditions.push(sql`(location_id = ${input.locationId} OR location_id IS NULL)`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, profile_name, button_count, key_mappings, is_default,
                 is_active, location_id, created_at, updated_at
          FROM fnb_kds_bump_bar_profiles
          WHERE ${whereClause}
          ORDER BY is_default DESC, profile_name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      profileName: r.profile_name as string,
      buttonCount: Number(r.button_count),
      keyMappings: (r.key_mappings ?? []) as BumpBarKeyMapping[],
      isDefault: r.is_default as boolean,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  });
}

export async function getBumpBarProfile(input: {
  tenantId: string;
  profileId: string;
}): Promise<BumpBarProfileDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, profile_name, button_count, key_mappings, is_default,
                 is_active, location_id, created_at, updated_at
          FROM fnb_kds_bump_bar_profiles
          WHERE id = ${input.profileId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) return null;
    const r = arr[0]!;

    return {
      id: r.id as string,
      profileName: r.profile_name as string,
      buttonCount: Number(r.button_count),
      keyMappings: (r.key_mappings ?? []) as BumpBarKeyMapping[],
      isDefault: r.is_default as boolean,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });
}

// ── Alert Profiles ──────────────────────────────────────────────

export async function listAlertProfiles(input: {
  tenantId: string;
  locationId?: string;
}): Promise<AlertProfileListItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`is_active = true`,
    ];

    if (input.locationId) {
      conditions.push(sql`(location_id = ${input.locationId} OR location_id IS NULL)`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, profile_name, new_ticket_alert, warning_alert,
                 critical_alert, rush_alert, allergy_alert, modification_alert,
                 complete_alert, is_default, is_active, location_id,
                 created_at, updated_at
          FROM fnb_kds_alert_profiles
          WHERE ${whereClause}
          ORDER BY is_default DESC, profile_name ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      profileName: r.profile_name as string,
      newTicketAlert: (r.new_ticket_alert as AlertEventConfig) ?? null,
      warningAlert: (r.warning_alert as AlertEventConfig) ?? null,
      criticalAlert: (r.critical_alert as AlertEventConfig) ?? null,
      rushAlert: (r.rush_alert as AlertEventConfig) ?? null,
      allergyAlert: (r.allergy_alert as AlertEventConfig) ?? null,
      modificationAlert: (r.modification_alert as AlertEventConfig) ?? null,
      completeAlert: (r.complete_alert as AlertEventConfig) ?? null,
      isDefault: r.is_default as boolean,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  });
}

export async function getAlertProfile(input: {
  tenantId: string;
  profileId: string;
}): Promise<AlertProfileDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, profile_name, new_ticket_alert, warning_alert,
                 critical_alert, rush_alert, allergy_alert, modification_alert,
                 complete_alert, is_default, is_active, location_id,
                 created_at, updated_at
          FROM fnb_kds_alert_profiles
          WHERE id = ${input.profileId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );

    const arr = Array.from(rows as Iterable<Record<string, unknown>>);
    if (arr.length === 0) return null;
    const r = arr[0]!;

    return {
      id: r.id as string,
      profileName: r.profile_name as string,
      newTicketAlert: (r.new_ticket_alert as AlertEventConfig) ?? null,
      warningAlert: (r.warning_alert as AlertEventConfig) ?? null,
      criticalAlert: (r.critical_alert as AlertEventConfig) ?? null,
      rushAlert: (r.rush_alert as AlertEventConfig) ?? null,
      allergyAlert: (r.allergy_alert as AlertEventConfig) ?? null,
      modificationAlert: (r.modification_alert as AlertEventConfig) ?? null,
      completeAlert: (r.complete_alert as AlertEventConfig) ?? null,
      isDefault: r.is_default as boolean,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });
}

// ── Performance Targets ─────────────────────────────────────────

export async function listPerformanceTargets(input: {
  tenantId: string;
  locationId?: string;
  stationId?: string;
}): Promise<PerformanceTargetItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`pt.tenant_id = ${input.tenantId}`,
      sql`pt.is_active = true`,
    ];

    if (input.locationId) {
      conditions.push(sql`(pt.location_id = ${input.locationId} OR pt.location_id IS NULL)`);
    }
    if (input.stationId) {
      conditions.push(sql`(pt.station_id = ${input.stationId} OR pt.station_id IS NULL)`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT pt.id, pt.station_id, pt.order_type, pt.target_prep_seconds,
                 pt.warning_prep_seconds, pt.critical_prep_seconds,
                 pt.speed_of_service_goal_seconds, pt.is_active, pt.location_id,
                 pt.created_at, pt.updated_at,
                 ks.display_name AS station_name
          FROM fnb_kds_performance_targets pt
          LEFT JOIN fnb_kitchen_stations ks ON ks.id = pt.station_id AND ks.tenant_id = pt.tenant_id
          WHERE ${whereClause}
          ORDER BY pt.station_id NULLS LAST, pt.order_type NULLS LAST`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      stationId: (r.station_id as string) ?? null,
      stationName: (r.station_name as string) ?? null,
      orderType: (r.order_type as string) ?? null,
      targetPrepSeconds: Number(r.target_prep_seconds),
      warningPrepSeconds: Number(r.warning_prep_seconds),
      criticalPrepSeconds: Number(r.critical_prep_seconds),
      speedOfServiceGoalSeconds: r.speed_of_service_goal_seconds != null
        ? Number(r.speed_of_service_goal_seconds)
        : null,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  });
}

// ── Item Prep Times ─────────────────────────────────────────────

export async function listItemPrepTimes(input: {
  tenantId: string;
  stationId?: string;
  catalogItemId?: string;
}): Promise<ItemPrepTimeItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`ipt.tenant_id = ${input.tenantId}`,
      sql`ipt.is_active = true`,
    ];

    if (input.stationId) {
      conditions.push(sql`(ipt.station_id = ${input.stationId} OR ipt.station_id IS NULL)`);
    }
    if (input.catalogItemId) {
      conditions.push(sql`ipt.catalog_item_id = ${input.catalogItemId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT ipt.id, ipt.catalog_item_id, ipt.station_id, ipt.estimated_prep_seconds,
                 ipt.is_active, ipt.created_at, ipt.updated_at,
                 ci.name AS catalog_item_name,
                 ks.display_name AS station_name
          FROM fnb_kds_item_prep_times ipt
          LEFT JOIN catalog_items ci ON ci.id = ipt.catalog_item_id AND ci.tenant_id = ipt.tenant_id
          LEFT JOIN fnb_kitchen_stations ks ON ks.id = ipt.station_id AND ks.tenant_id = ipt.tenant_id
          WHERE ${whereClause}
          ORDER BY ci.name ASC NULLS LAST, ipt.station_id NULLS LAST`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      catalogItemId: r.catalog_item_id as string,
      catalogItemName: (r.catalog_item_name as string) ?? null,
      stationId: (r.station_id as string) ?? null,
      stationName: (r.station_name as string) ?? null,
      estimatedPrepSeconds: Number(r.estimated_prep_seconds),
      isActive: r.is_active as boolean,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  });
}

// ── Composite KDS Station Settings ──────────────────────────────

export async function getKdsStationSettings(input: {
  tenantId: string;
  stationId: string;
}): Promise<KdsStationSettings | null> {
  return withTenant(input.tenantId, async (tx) => {
    // 1. Fetch station info
    const stationRows = await tx.execute(
      sql`SELECT id, name, display_name, station_type, color, sort_order,
                 warning_threshold_seconds, critical_threshold_seconds, is_active
          FROM fnb_kitchen_stations
          WHERE id = ${input.stationId} AND tenant_id = ${input.tenantId}
          LIMIT 1`,
    );
    const stationArr = Array.from(stationRows as Iterable<Record<string, unknown>>);
    if (stationArr.length === 0) return null;
    const s = stationArr[0]!;

    // Run remaining queries in parallel for performance
    const [displayRows, bumpBarRows, alertRows, targetRows, routingRows] = await Promise.all([
      // 2. Fetch display config for this station
      tx.execute(
        sql`SELECT id, display_device_id, display_mode, columns_per_row, sort_by,
                   show_modifiers, show_seat_numbers, show_course_headers,
                   auto_scroll_enabled, sound_alert_enabled
            FROM fnb_station_display_configs
            WHERE station_id = ${input.stationId} AND tenant_id = ${input.tenantId}
            LIMIT 1`,
      ),

      // 3. Fetch the default bump bar profile for this tenant
      tx.execute(
        sql`SELECT id, profile_name, button_count, key_mappings, is_default,
                   is_active, location_id, created_at, updated_at
            FROM fnb_kds_bump_bar_profiles
            WHERE tenant_id = ${input.tenantId} AND is_default = true AND is_active = true
            LIMIT 1`,
      ),

      // 4. Fetch the default alert profile for this tenant
      tx.execute(
        sql`SELECT id, profile_name, new_ticket_alert, warning_alert,
                   critical_alert, rush_alert, allergy_alert, modification_alert,
                   complete_alert, is_default, is_active, location_id,
                   created_at, updated_at
            FROM fnb_kds_alert_profiles
            WHERE tenant_id = ${input.tenantId} AND is_default = true AND is_active = true
            LIMIT 1`,
      ),

      // 5. Fetch performance targets for this station (and global fallbacks)
      tx.execute(
        sql`SELECT id, station_id, order_type, target_prep_seconds,
                   warning_prep_seconds, critical_prep_seconds,
                   speed_of_service_goal_seconds, is_active, location_id,
                   created_at, updated_at
            FROM fnb_kds_performance_targets
            WHERE tenant_id = ${input.tenantId}
              AND (station_id = ${input.stationId} OR station_id IS NULL)
              AND is_active = true
            ORDER BY station_id NULLS LAST, order_type NULLS LAST`,
      ),

      // 6. Fetch routing rules for this station
      tx.execute(
        sql`SELECT id, rule_type, catalog_item_id, modifier_id, department_id,
                   sub_department_id, station_id, priority, is_active
            FROM fnb_kitchen_routing_rules
            WHERE station_id = ${input.stationId} AND tenant_id = ${input.tenantId}
              AND is_active = true
            ORDER BY priority DESC`,
      ),
    ]);

    // Map display config
    const displayArr = Array.from(displayRows as Iterable<Record<string, unknown>>);
    let displayConfig: KdsStationSettings['displayConfig'] = null;
    if (displayArr.length > 0) {
      const c = displayArr[0]!;
      displayConfig = {
        id: c.id as string,
        displayDeviceId: (c.display_device_id as string) ?? null,
        displayMode: c.display_mode as string,
        columnsPerRow: Number(c.columns_per_row),
        sortBy: c.sort_by as string,
        showModifiers: c.show_modifiers as boolean,
        showSeatNumbers: c.show_seat_numbers as boolean,
        showCourseHeaders: c.show_course_headers as boolean,
        autoScrollEnabled: c.auto_scroll_enabled as boolean,
        soundAlertEnabled: c.sound_alert_enabled as boolean,
      };
    }

    // Map bump bar profile
    const bumpBarArr = Array.from(bumpBarRows as Iterable<Record<string, unknown>>);
    let bumpBarProfile: BumpBarProfileListItem | null = null;
    if (bumpBarArr.length > 0) {
      const b = bumpBarArr[0]!;
      bumpBarProfile = {
        id: b.id as string,
        profileName: b.profile_name as string,
        buttonCount: Number(b.button_count),
        keyMappings: (b.key_mappings ?? []) as BumpBarKeyMapping[],
        isDefault: b.is_default as boolean,
        isActive: b.is_active as boolean,
        locationId: (b.location_id as string) ?? null,
        createdAt: String(b.created_at),
        updatedAt: String(b.updated_at),
      };
    }

    // Map alert profile
    const alertArr = Array.from(alertRows as Iterable<Record<string, unknown>>);
    let alertProfile: AlertProfileListItem | null = null;
    if (alertArr.length > 0) {
      const a = alertArr[0]!;
      alertProfile = {
        id: a.id as string,
        profileName: a.profile_name as string,
        newTicketAlert: (a.new_ticket_alert as AlertEventConfig) ?? null,
        warningAlert: (a.warning_alert as AlertEventConfig) ?? null,
        criticalAlert: (a.critical_alert as AlertEventConfig) ?? null,
        rushAlert: (a.rush_alert as AlertEventConfig) ?? null,
        allergyAlert: (a.allergy_alert as AlertEventConfig) ?? null,
        modificationAlert: (a.modification_alert as AlertEventConfig) ?? null,
        completeAlert: (a.complete_alert as AlertEventConfig) ?? null,
        isDefault: a.is_default as boolean,
        isActive: a.is_active as boolean,
        locationId: (a.location_id as string) ?? null,
        createdAt: String(a.created_at),
        updatedAt: String(a.updated_at),
      };
    }

    // Map performance targets
    const stationDisplayName = s.display_name as string;
    const performanceTargets = Array.from(
      targetRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      id: r.id as string,
      stationId: (r.station_id as string) ?? null,
      stationName: r.station_id != null ? stationDisplayName : null,
      orderType: (r.order_type as string) ?? null,
      targetPrepSeconds: Number(r.target_prep_seconds),
      warningPrepSeconds: Number(r.warning_prep_seconds),
      criticalPrepSeconds: Number(r.critical_prep_seconds),
      speedOfServiceGoalSeconds: r.speed_of_service_goal_seconds != null
        ? Number(r.speed_of_service_goal_seconds)
        : null,
      isActive: r.is_active as boolean,
      locationId: (r.location_id as string) ?? null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    // Map routing rules
    const routingRules = Array.from(
      routingRows as Iterable<Record<string, unknown>>,
    ).map((r) => ({
      id: r.id as string,
      ruleType: r.rule_type as string,
      catalogItemId: (r.catalog_item_id as string) ?? null,
      modifierId: (r.modifier_id as string) ?? null,
      departmentId: (r.department_id as string) ?? null,
      subDepartmentId: (r.sub_department_id as string) ?? null,
      stationId: r.station_id as string,
      priority: Number(r.priority),
      isActive: r.is_active as boolean,
    }));

    return {
      station: {
        id: s.id as string,
        name: s.name as string,
        displayName: s.display_name as string,
        stationType: s.station_type as string,
        color: (s.color as string) ?? null,
        sortOrder: Number(s.sort_order),
        warningThresholdSeconds: Number(s.warning_threshold_seconds),
        criticalThresholdSeconds: Number(s.critical_threshold_seconds),
        isActive: s.is_active as boolean,
      },
      displayConfig,
      bumpBarProfile,
      alertProfile,
      performanceTargets,
      routingRules,
    };
  });
}
