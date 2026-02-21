import { describe, it, expect } from 'vitest';
import { FNB_INTERACTION_FLOWS, FNB_SCREENS } from '../helpers/ux-screen-map';
import type { InteractionFlow, FlowStep } from '../helpers/ux-screen-map';

describe('FNB_INTERACTION_FLOWS', () => {
  it('has 6 interaction flows', () => {
    expect(FNB_INTERACTION_FLOWS).toHaveLength(6);
  });

  it('each flow has steps', () => {
    for (const flow of FNB_INTERACTION_FLOWS) {
      expect(flow.id).toBeTruthy();
      expect(flow.name).toBeTruthy();
      expect(flow.description).toBeTruthy();
      expect(flow.steps.length).toBeGreaterThan(0);
    }
  });

  it('step numbers are sequential', () => {
    for (const flow of FNB_INTERACTION_FLOWS) {
      for (let i = 0; i < flow.steps.length; i++) {
        expect(flow.steps[i]!.stepNumber).toBe(i + 1);
      }
    }
  });

  it('all screen references are valid', () => {
    const validScreenIds = Object.values(FNB_SCREENS).map((s) => s.id);
    for (const flow of FNB_INTERACTION_FLOWS) {
      for (const step of flow.steps) {
        expect(validScreenIds).toContain(step.screen);
      }
    }
  });
});

describe('Flow 1: Dine-In Full Lifecycle', () => {
  const flow = FNB_INTERACTION_FLOWS.find((f) => f.id === 'dine_in_full')!;

  it('starts at floor plan', () => {
    expect(flow.steps[0]!.screen).toBe('floor_plan');
  });

  it('has 10 steps', () => {
    expect(flow.steps).toHaveLength(10);
  });

  it('creates tab on seating', () => {
    const seatStep = flow.steps[1]!;
    expect(seatStep.events).toContain('fnb.tab.opened.v1');
    expect(seatStep.events).toContain('fnb.table.status_changed.v1');
  });

  it('sends kitchen ticket on course send', () => {
    const sendStep = flow.steps[3]!;
    expect(sendStep.screen).toBe('tab_view');
    expect(sendStep.events).toContain('fnb.ticket.created.v1');
    expect(sendStep.events).toContain('fnb.course.sent.v1');
  });

  it('involves kds bump', () => {
    const kdsStep = flow.steps[4]!;
    expect(kdsStep.screen).toBe('kds_station');
    expect(kdsStep.events).toContain('fnb.item.bumped.v1');
  });

  it('involves expo bump', () => {
    const expoStep = flow.steps[6]!;
    expect(expoStep.screen).toBe('expo_view');
    expect(expoStep.events).toContain('fnb.ticket.bumped.v1');
  });

  it('ends with payment and table clear', () => {
    const lastStep = flow.steps[flow.steps.length - 1]!;
    expect(lastStep.screen).toBe('floor_plan');
    expect(lastStep.events).toContain('fnb.tab.closed.v1');
    expect(lastStep.events).toContain('fnb.table.status_changed.v1');
  });
});

describe('Flow 2: Bar Tab Pre-Auth', () => {
  const flow = FNB_INTERACTION_FLOWS.find((f) => f.id === 'bar_tab_preauth')!;

  it('starts with tab open', () => {
    expect(flow.steps[0]!.screen).toBe('tab_view');
    expect(flow.steps[0]!.events).toContain('fnb.tab.opened.v1');
  });

  it('creates pre-auth on card swipe', () => {
    const authStep = flow.steps[1]!;
    expect(authStep.events).toContain('fnb.preauth.created.v1');
  });

  it('captures pre-auth with tip', () => {
    const captureStep = flow.steps[4]!;
    expect(captureStep.events).toContain('fnb.preauth.captured.v1');
    expect(captureStep.events).toContain('fnb.tip.collected.v1');
  });

  it('auto-closes tab after capture', () => {
    const lastStep = flow.steps[flow.steps.length - 1]!;
    expect(lastStep.events).toContain('fnb.tab.closed.v1');
  });
});

describe('Flow 3: Transfer Tab', () => {
  const flow = FNB_INTERACTION_FLOWS.find((f) => f.id === 'transfer_tab')!;

  it('has 3 steps', () => {
    expect(flow.steps).toHaveLength(3);
  });

  it('starts and ends on floor plan', () => {
    expect(flow.steps[0]!.screen).toBe('floor_plan');
    expect(flow.steps[2]!.screen).toBe('floor_plan');
  });

  it('emits transfer event on confirm', () => {
    expect(flow.steps[2]!.events).toContain('fnb.tab.transferred.v1');
  });
});

describe('Flow 4: Void After Send', () => {
  const flow = FNB_INTERACTION_FLOWS.find((f) => f.id === 'void_after_send')!;

  it('starts on tab view', () => {
    expect(flow.steps[0]!.screen).toBe('tab_view');
  });

  it('creates delta chit on void', () => {
    const deltaStep = flow.steps[2]!;
    expect(deltaStep.events).toContain('fnb.delta_chit.created.v1');
  });

  it('shows void on kds', () => {
    const kdsStep = flow.steps[3]!;
    expect(kdsStep.screen).toBe('kds_station');
  });
});

describe('Flow 5: Close Batch & GL Post', () => {
  const flow = FNB_INTERACTION_FLOWS.find((f) => f.id === 'close_batch_gl')!;

  it('starts from manager dashboard', () => {
    expect(flow.steps[0]!.screen).toBe('manager_dashboard');
    expect(flow.steps[0]!.events).toContain('fnb.close_batch.started.v1');
  });

  it('includes server checkout', () => {
    const checkoutStep = flow.steps[1]!;
    expect(checkoutStep.screen).toBe('close_batch');
    expect(checkoutStep.events).toContain('fnb.server.checked_out.v1');
  });

  it('ends with GL posting', () => {
    const lastStep = flow.steps[flow.steps.length - 1]!;
    expect(lastStep.events).toContain('fnb.close_batch.posted.v1');
    expect(lastStep.events).toContain('fnb.gl_posting.created.v1');
  });
});

describe('Flow 6: 86 Item Mid-Service', () => {
  const flow = FNB_INTERACTION_FLOWS.find((f) => f.id === 'eighty_six_mid_service')!;

  it('starts from manager dashboard', () => {
    expect(flow.steps[0]!.screen).toBe('manager_dashboard');
  });

  it('emits 86 event', () => {
    const eightyStep = flow.steps[2]!;
    expect(eightyStep.events).toContain('fnb.item.eighty_sixed.v1');
  });

  it('blocks adding 86ed item on tab view', () => {
    const lastStep = flow.steps[3]!;
    expect(lastStep.screen).toBe('tab_view');
    expect(lastStep.result).toContain('unavailable');
  });
});
