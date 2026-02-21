import { describe, it, expect } from 'vitest';
import { FNB_WIREFRAMES } from '../helpers/ux-screen-map';

describe('FNB_WIREFRAMES', () => {
  it('has 3 wireframe descriptions', () => {
    expect(FNB_WIREFRAMES).toHaveLength(3);
  });

  it('covers the 3 most critical screens', () => {
    const ids = FNB_WIREFRAMES.map((w) => w.screenId);
    expect(ids).toContain('floor_plan');
    expect(ids).toContain('tab_view');
    expect(ids).toContain('kds_station');
  });
});

describe('Floor Plan Wireframe', () => {
  const wireframe = FNB_WIREFRAMES.find((w) => w.screenId === 'floor_plan')!;

  it('has full screen layout', () => {
    expect(wireframe.layout).toContain('Full screen');
  });

  it('has room tabs, table grid, and action bar', () => {
    const panelNames = wireframe.panels.map((p) => p.name);
    expect(panelNames).toContain('Room Tabs');
    expect(panelNames).toContain('Table Grid');
    expect(panelNames).toContain('Action Bar');
  });

  it('table grid shows status colors', () => {
    const grid = wireframe.panels.find((p) => p.name === 'Table Grid')!;
    const colorContent = grid.content.find((c) => c.includes('green=available'));
    expect(colorContent).toBeDefined();
    expect(colorContent).toContain('blue=occupied');
    expect(colorContent).toContain('red=needs_attention');
  });

  it('table grid shows table info', () => {
    const grid = wireframe.panels.find((p) => p.name === 'Table Grid')!;
    const infoContent = grid.content.find((c) => c.includes('number'));
    expect(infoContent).toBeDefined();
    expect(infoContent).toContain('server initials');
    expect(infoContent).toContain('party size');
    expect(infoContent).toContain('elapsed time');
  });

  it('action bar has key actions', () => {
    const bar = wireframe.panels.find((p) => p.name === 'Action Bar')!;
    expect(bar.content[0]).toContain('Seat Table');
    expect(bar.content[0]).toContain('View Tab');
    expect(bar.content[0]).toContain('Transfer');
  });
});

describe('Tab View Wireframe', () => {
  const wireframe = FNB_WIREFRAMES.find((w) => w.screenId === 'tab_view')!;

  it('is three-panel layout', () => {
    expect(wireframe.layout).toContain('Three-panel');
    expect(wireframe.panels).toHaveLength(3);
  });

  it('menu browser is 30%', () => {
    const menu = wireframe.panels.find((p) => p.name === 'Menu Browser')!;
    expect(menu.width).toBe('30%');
    expect(menu.position).toBe('left');
    expect(menu.content.find((c) => c.includes('Department tabs'))).toBeDefined();
    expect(menu.content.find((c) => c.includes('86ed items grayed out'))).toBeDefined();
  });

  it('seat/course grid is 40% center', () => {
    const grid = wireframe.panels.find((p) => p.name === 'Seat × Course Grid')!;
    expect(grid.width).toBe('40%');
    expect(grid.position).toBe('center');
    expect(grid.content.find((c) => c.includes('Columns = seats'))).toBeDefined();
    expect(grid.content.find((c) => c.includes('Rows = courses'))).toBeDefined();
  });

  it('tab summary is 30% right', () => {
    const summary = wireframe.panels.find((p) => p.name === 'Tab Summary')!;
    expect(summary.width).toBe('30%');
    expect(summary.position).toBe('right');
    expect(summary.content.find((c) => c.includes('Subtotal, tax'))).toBeDefined();
    expect(summary.content.find((c) => c.includes('Send All'))).toBeDefined();
  });

  it('menu shows 86ed items as unavailable', () => {
    const menu = wireframe.panels.find((p) => p.name === 'Menu Browser')!;
    const eighty6 = menu.content.find((c) => c.includes('86ed'));
    expect(eighty6).toBeDefined();
    expect(eighty6).toContain('grayed out');
  });
});

describe('KDS Station Wireframe', () => {
  const wireframe = FNB_WIREFRAMES.find((w) => w.screenId === 'kds_station')!;

  it('is horizontal no-scroll layout', () => {
    expect(wireframe.layout).toContain('Horizontal');
    expect(wireframe.layout).toContain('no scrolling');
  });

  it('has station header', () => {
    const header = wireframe.panels.find((p) => p.name === 'Station Header')!;
    expect(header.content.find((c) => c.includes('Station name'))).toBeDefined();
    expect(header.content.find((c) => c.includes('Pending tickets count'))).toBeDefined();
    expect(header.content.find((c) => c.includes('Average ticket time'))).toBeDefined();
  });

  it('ticket queue shows cards oldest-to-newest', () => {
    const queue = wireframe.panels.find((p) => p.name === 'Ticket Queue')!;
    const layout = queue.content.find((c) => c.includes('oldest on left'));
    expect(layout).toBeDefined();
    expect(layout).toContain('newest on right');
  });

  it('ticket cards have priority colors', () => {
    const queue = wireframe.panels.find((p) => p.name === 'Ticket Queue')!;
    const priority = queue.content.find((c) => c.includes('Priority color'));
    expect(priority).toBeDefined();
    expect(priority).toContain('rush=orange');
    expect(priority).toContain('VIP=gold');
  });

  it('has per-item and per-ticket bump buttons', () => {
    const queue = wireframe.panels.find((p) => p.name === 'Ticket Queue')!;
    expect(queue.content.find((c) => c.includes('Per-item bump button'))).toBeDefined();
    expect(queue.content.find((c) => c.includes('Full-ticket bump button'))).toBeDefined();
  });

  it('shows allergen flags in red', () => {
    const queue = wireframe.panels.find((p) => p.name === 'Ticket Queue')!;
    expect(queue.content.find((c) => c.includes('Allergen flags in red'))).toBeDefined();
  });
});
