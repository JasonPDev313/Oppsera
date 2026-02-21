import { describe, it, expect } from 'vitest';
import {
  FNB_SCREENS,
  COMPONENT_REUSE_MAP,
  FNB_SCREEN_PERMISSIONS,
  FNB_NAV_ITEMS,
  FNB_BREAKPOINTS,
  MODE_SWITCHING,
} from '../helpers/ux-screen-map';
import type { ScreenDefinition, ComponentReuse, ScreenPermission, NavItem } from '../helpers/ux-screen-map';

describe('FNB_SCREENS', () => {
  it('has 10 screens', () => {
    expect(Object.keys(FNB_SCREENS)).toHaveLength(10);
  });

  it('each screen has required properties', () => {
    for (const [key, screen] of Object.entries(FNB_SCREENS)) {
      expect(screen.id).toBeTruthy();
      expect(screen.name).toBeTruthy();
      expect(screen.path).toBeTruthy();
      expect(screen.description).toBeTruthy();
      expect(screen.components.length).toBeGreaterThan(0);
      expect(screen.dataSources.length).toBeGreaterThan(0);
      expect(typeof screen.sharedWithRetail).toBe('boolean');
      expect(screen.responsive.primary).toBeTruthy();
    }
  });

  it('FLOOR_PLAN is restaurant home screen', () => {
    const fp = FNB_SCREENS.FLOOR_PLAN;
    expect(fp.path).toBe('/pos/fnb');
    expect(fp.primaryRole).toBe('all');
    expect(fp.sharedWithRetail).toBe(false);
    expect(fp.components).toContain('TableGrid');
    expect(fp.components).toContain('FloorPlanCanvas');
  });

  it('TAB_VIEW is main ordering screen', () => {
    const tv = FNB_SCREENS.TAB_VIEW;
    expect(tv.path).toContain('/pos/fnb/tab/');
    expect(tv.primaryRole).toBe('server');
    expect(tv.components).toContain('MenuBrowser');
    expect(tv.components).toContain('SeatCourseGrid');
    expect(tv.components).toContain('TabSummary');
    expect(tv.components).toContain('ModifierDialog');
  });

  it('KDS_STATION uses kds_display responsive target', () => {
    const kds = FNB_SCREENS.KDS_STATION;
    expect(kds.responsive.primary).toBe('kds_display');
    expect(kds.primaryRole).toBe('kitchen');
    expect(kds.components).toContain('BumpButton');
  });

  it('EXPO_VIEW is all-station readiness view', () => {
    const expo = FNB_SCREENS.EXPO_VIEW;
    expect(expo.components).toContain('StationReadinessIndicator');
    expect(expo.components).toContain('CallBackButton');
  });

  it('PAYMENT is shared with retail (TenderDialog)', () => {
    const pay = FNB_SCREENS.PAYMENT;
    expect(pay.sharedWithRetail).toBe(true);
    expect(pay.components).toContain('SplitOptions');
    expect(pay.components).toContain('TipPrompt');
  });

  it('SERVER_DASHBOARD primary responsive is ipad_portrait', () => {
    const sd = FNB_SCREENS.SERVER_DASHBOARD;
    expect(sd.responsive.primary).toBe('ipad_portrait');
    expect(sd.components).toContain('MyTablesGrid');
    expect(sd.components).toContain('TipsTodayCard');
  });

  it('HOST_STAND has availability board', () => {
    const hs = FNB_SCREENS.HOST_STAND;
    expect(hs.primaryRole).toBe('host');
    expect(hs.components).toContain('AvailabilityBoard');
    expect(hs.components).toContain('RotationQueue');
  });

  it('MANAGER_DASHBOARD has manager-level components', () => {
    const md = FNB_SCREENS.MANAGER_DASHBOARD;
    expect(md.primaryRole).toBe('manager');
    expect(md.components).toContain('LiveKpiCards');
    expect(md.components).toContain('EightySixBoard');
    expect(md.components).toContain('AlertFeed');
    expect(md.components).toContain('CloseBatchLauncher');
  });

  it('CLOSE_BATCH has cash count and reconciliation', () => {
    const cb = FNB_SCREENS.CLOSE_BATCH;
    expect(cb.components).toContain('CashCountForm');
    expect(cb.components).toContain('OverShortDisplay');
    expect(cb.dataSources).toContain('getZReport');
  });

  it('SETTINGS references all 9 settings forms', () => {
    const st = FNB_SCREENS.SETTINGS;
    expect(st.components).toContain('GeneralSettingsForm');
    expect(st.components).toContain('KitchenSettingsForm');
    expect(st.components).toContain('HardwareSettingsForm');
    expect(st.components.length).toBeGreaterThanOrEqual(10);
  });
});

describe('COMPONENT_REUSE_MAP', () => {
  it('has shared and fnb-only components', () => {
    const shared = COMPONENT_REUSE_MAP.filter((c) => c.sharedWithRetail);
    const fnbOnly = COMPONENT_REUSE_MAP.filter((c) => c.fnbOnly);
    expect(shared.length).toBeGreaterThan(0);
    expect(fnbOnly.length).toBeGreaterThan(0);
  });

  it('shared components include TenderDialog', () => {
    const tender = COMPONENT_REUSE_MAP.find((c) => c.component === 'TenderDialog');
    expect(tender).toBeDefined();
    expect(tender?.sharedWithRetail).toBe(true);
  });

  it('shared components include catalog navigation', () => {
    const shared = COMPONENT_REUSE_MAP.filter((c) => c.sharedWithRetail);
    const names = shared.map((c) => c.component);
    expect(names).toContain('DepartmentTabs');
    expect(names).toContain('SubDepartmentTabs');
    expect(names).toContain('CategoryRail');
    expect(names).toContain('ItemButton');
  });

  it('fnb-only components include seat/course grid', () => {
    const fnb = COMPONENT_REUSE_MAP.filter((c) => c.fnbOnly);
    const names = fnb.map((c) => c.component);
    expect(names).toContain('SeatCourseGrid');
    expect(names).toContain('SeatSelector');
    expect(names).toContain('CourseSelector');
    expect(names).toContain('TicketCard');
    expect(names).toContain('BumpButton');
  });

  it('no component is both shared and fnb-only', () => {
    for (const c of COMPONENT_REUSE_MAP) {
      expect(c.sharedWithRetail && c.fnbOnly).toBe(false);
    }
  });
});

describe('FNB_SCREEN_PERMISSIONS', () => {
  it('has permission for each screen', () => {
    const screenIds = Object.values(FNB_SCREENS).map((s) => s.id);
    for (const id of screenIds) {
      const perm = FNB_SCREEN_PERMISSIONS.find((p) => p.screenId === id);
      expect(perm).toBeDefined();
    }
  });

  it('owner has access to all screens', () => {
    for (const perm of FNB_SCREEN_PERMISSIONS) {
      expect(perm.allowedRoles).toContain('owner');
    }
  });

  it('manager has access to all screens', () => {
    for (const perm of FNB_SCREEN_PERMISSIONS) {
      expect(perm.allowedRoles).toContain('manager');
    }
  });

  it('kitchen role only accesses kds and expo', () => {
    const kitchenPerms = FNB_SCREEN_PERMISSIONS.filter(
      (p) => p.allowedRoles.includes('kitchen'),
    );
    const screenIds = kitchenPerms.map((p) => p.screenId);
    expect(screenIds).toContain('kds_station');
    expect(screenIds).toContain('expo_view');
    expect(screenIds).not.toContain('payment');
    expect(screenIds).not.toContain('settings');
  });

  it('host role accesses floor plan and host stand', () => {
    const hostPerms = FNB_SCREEN_PERMISSIONS.filter(
      (p) => p.allowedRoles.includes('host'),
    );
    const screenIds = hostPerms.map((p) => p.screenId);
    expect(screenIds).toContain('floor_plan');
    expect(screenIds).toContain('host_stand');
    expect(screenIds).not.toContain('kds_station');
  });

  it('close_batch restricted to owner and manager', () => {
    const batchPerm = FNB_SCREEN_PERMISSIONS.find((p) => p.screenId === 'close_batch');
    expect(batchPerm?.allowedRoles).toEqual(['owner', 'manager']);
  });
});

describe('FNB_NAV_ITEMS', () => {
  it('has root navigation items', () => {
    expect(FNB_NAV_ITEMS.length).toBeGreaterThan(0);
  });

  it('floor plan is first nav item', () => {
    expect(FNB_NAV_ITEMS[0]!.id).toBe('floor_plan');
    expect(FNB_NAV_ITEMS[0]!.path).toBe('/pos/fnb');
  });

  it('kds has expo as child', () => {
    const kds = FNB_NAV_ITEMS.find((n) => n.id === 'kds');
    expect(kds).toBeDefined();
    expect(kds?.children).toBeDefined();
    expect(kds?.children?.[0]?.id).toBe('kds_expo');
  });

  it('manager has close batch and 86 board as children', () => {
    const manager = FNB_NAV_ITEMS.find((n) => n.id === 'manager');
    expect(manager?.children).toBeDefined();
    const childIds = manager?.children?.map((c) => c.id);
    expect(childIds).toContain('close_batch');
    expect(childIds).toContain('eighty_six');
  });

  it('each nav item has required permission', () => {
    for (const item of FNB_NAV_ITEMS) {
      expect(item.requiredPermission).toBeTruthy();
    }
  });

  it('uses lucide-react icon names', () => {
    const validIcons = ['LayoutGrid', 'User', 'ClipboardList', 'ChefHat', 'Eye', 'BarChart3', 'Lock', 'Ban', 'Settings'];
    for (const item of FNB_NAV_ITEMS) {
      expect(validIcons).toContain(item.icon);
    }
  });
});

describe('FNB_BREAKPOINTS', () => {
  it('has 4 breakpoints', () => {
    expect(Object.keys(FNB_BREAKPOINTS)).toHaveLength(4);
  });

  it('kds_display is widest', () => {
    expect(FNB_BREAKPOINTS.kds_display.minWidth).toBeGreaterThan(FNB_BREAKPOINTS.desktop.minWidth);
  });

  it('ipad_portrait is narrowest tablet', () => {
    expect(FNB_BREAKPOINTS.ipad_portrait.minWidth).toBe(768);
    expect(FNB_BREAKPOINTS.ipad_portrait.orientation).toBe('portrait');
  });
});

describe('MODE_SWITCHING', () => {
  it('uses css toggle mechanism', () => {
    expect(MODE_SWITCHING.mechanism).toBe('css_toggle');
  });

  it('has correct paths', () => {
    expect(MODE_SWITCHING.retailPath).toBe('/pos/retail');
    expect(MODE_SWITCHING.fnbPath).toBe('/pos/fnb');
  });

  it('terminal config is localStorage for V1', () => {
    expect(MODE_SWITCHING.terminalConfig).toBe('localStorage (V1)');
  });
});
