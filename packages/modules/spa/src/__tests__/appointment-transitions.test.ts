import { describe, it, expect } from 'vitest';
import {
  canTransitionAppointment,
  assertAppointmentTransition,
  isTerminalStatus,
  isActiveStatus,
  getEventTypeForTransition,
  getStatusLabel,
  APPOINTMENT_TRANSITIONS,
  ACTIVE_APPOINTMENT_STATUSES,
  TERMINAL_STATUSES,
  CONFLICT_EXCLUDED_STATUSES,
} from '../helpers/appointment-transitions';
import type { AppointmentStatus } from '../helpers/appointment-transitions';
import { SPA_EVENTS } from '../events/types';
import { AppError } from '@oppsera/shared';

// ── Helpers ────────────────────────────────────────────────────────

const ALL_STATUSES: AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
  'checked_out',
  'canceled',
  'no_show',
];

// ══════════════════════════════════════════════════════════════════
// canTransitionAppointment
// ══════════════════════════════════════════════════════════════════

describe('canTransitionAppointment', () => {
  // ── Valid transitions (happy path) ──────────────────────────────

  describe('valid transitions', () => {
    it('scheduled -> confirmed', () => {
      expect(canTransitionAppointment('scheduled', 'confirmed')).toBe(true);
    });

    it('scheduled -> canceled', () => {
      expect(canTransitionAppointment('scheduled', 'canceled')).toBe(true);
    });

    it('scheduled -> no_show', () => {
      expect(canTransitionAppointment('scheduled', 'no_show')).toBe(true);
    });

    it('scheduled -> checked_in (walk-in, skip confirm)', () => {
      expect(canTransitionAppointment('scheduled', 'checked_in')).toBe(true);
    });

    it('confirmed -> checked_in', () => {
      expect(canTransitionAppointment('confirmed', 'checked_in')).toBe(true);
    });

    it('confirmed -> canceled', () => {
      expect(canTransitionAppointment('confirmed', 'canceled')).toBe(true);
    });

    it('confirmed -> no_show', () => {
      expect(canTransitionAppointment('confirmed', 'no_show')).toBe(true);
    });

    it('checked_in -> in_service', () => {
      expect(canTransitionAppointment('checked_in', 'in_service')).toBe(true);
    });

    it('checked_in -> canceled (late cancel)', () => {
      expect(canTransitionAppointment('checked_in', 'canceled')).toBe(true);
    });

    it('in_service -> completed', () => {
      expect(canTransitionAppointment('in_service', 'completed')).toBe(true);
    });

    it('completed -> checked_out', () => {
      expect(canTransitionAppointment('completed', 'checked_out')).toBe(true);
    });
  });

  // ── Invalid transitions ─────────────────────────────────────────

  describe('invalid transitions', () => {
    it('completed -> scheduled (cannot go back to start)', () => {
      expect(canTransitionAppointment('completed', 'scheduled')).toBe(false);
    });

    it('checked_out -> confirmed (terminal cannot transition)', () => {
      expect(canTransitionAppointment('checked_out', 'confirmed')).toBe(false);
    });

    it('canceled -> scheduled (terminal cannot transition)', () => {
      expect(canTransitionAppointment('canceled', 'scheduled')).toBe(false);
    });

    it('no_show -> confirmed (terminal cannot transition)', () => {
      expect(canTransitionAppointment('no_show', 'confirmed')).toBe(false);
    });

    it('in_service -> checked_in (cannot go backward)', () => {
      expect(canTransitionAppointment('in_service', 'checked_in')).toBe(false);
    });

    it('confirmed -> completed (cannot skip steps)', () => {
      expect(canTransitionAppointment('confirmed', 'completed')).toBe(false);
    });

    it('scheduled -> completed (cannot skip to end)', () => {
      expect(canTransitionAppointment('scheduled', 'completed')).toBe(false);
    });

    it('scheduled -> checked_out (cannot skip to terminal)', () => {
      expect(canTransitionAppointment('scheduled', 'checked_out')).toBe(false);
    });

    it('checked_in -> checked_out (cannot skip completed)', () => {
      expect(canTransitionAppointment('checked_in', 'checked_out')).toBe(false);
    });

    it('in_service -> canceled (cannot cancel during service)', () => {
      expect(canTransitionAppointment('in_service', 'canceled')).toBe(false);
    });

    it('completed -> canceled (cannot cancel after completion)', () => {
      expect(canTransitionAppointment('completed', 'canceled')).toBe(false);
    });

    it('in_service -> no_show (cannot no-show during service)', () => {
      expect(canTransitionAppointment('in_service', 'no_show')).toBe(false);
    });

    it('checked_in -> no_show (cannot no-show after check-in)', () => {
      expect(canTransitionAppointment('checked_in', 'no_show')).toBe(false);
    });
  });

  // ── Self-transitions ────────────────────────────────────────────

  describe('self-transitions are not allowed', () => {
    for (const status of ALL_STATUSES) {
      it(`${status} -> ${status}`, () => {
        expect(canTransitionAppointment(status, status)).toBe(false);
      });
    }
  });

  // ── Terminal states cannot transition to anything ────────────────

  describe('terminal states have no outgoing transitions', () => {
    const terminalStatuses: AppointmentStatus[] = ['checked_out', 'canceled', 'no_show'];
    for (const terminal of terminalStatuses) {
      for (const target of ALL_STATUSES) {
        it(`${terminal} -> ${target} is false`, () => {
          expect(canTransitionAppointment(terminal, target)).toBe(false);
        });
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// assertAppointmentTransition
// ══════════════════════════════════════════════════════════════════

describe('assertAppointmentTransition', () => {
  describe('does not throw for valid transitions', () => {
    it('scheduled -> confirmed', () => {
      expect(() => assertAppointmentTransition('scheduled', 'confirmed')).not.toThrow();
    });

    it('confirmed -> checked_in', () => {
      expect(() => assertAppointmentTransition('confirmed', 'checked_in')).not.toThrow();
    });

    it('checked_in -> in_service', () => {
      expect(() => assertAppointmentTransition('checked_in', 'in_service')).not.toThrow();
    });

    it('in_service -> completed', () => {
      expect(() => assertAppointmentTransition('in_service', 'completed')).not.toThrow();
    });

    it('completed -> checked_out', () => {
      expect(() => assertAppointmentTransition('completed', 'checked_out')).not.toThrow();
    });

    it('scheduled -> canceled', () => {
      expect(() => assertAppointmentTransition('scheduled', 'canceled')).not.toThrow();
    });

    it('scheduled -> no_show', () => {
      expect(() => assertAppointmentTransition('scheduled', 'no_show')).not.toThrow();
    });
  });

  describe('throws AppError for invalid transitions', () => {
    it('throws with code INVALID_STATUS_TRANSITION', () => {
      try {
        assertAppointmentTransition('completed', 'scheduled');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('INVALID_STATUS_TRANSITION');
      }
    });

    it('throws with HTTP status 409', () => {
      try {
        assertAppointmentTransition('canceled', 'scheduled');
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as AppError).statusCode).toBe(409);
      }
    });

    it('includes from and to statuses in error message', () => {
      try {
        assertAppointmentTransition('no_show', 'confirmed');
        expect.fail('should have thrown');
      } catch (err) {
        const message = (err as AppError).message;
        expect(message).toContain('no_show');
        expect(message).toContain('confirmed');
      }
    });

    it('throws for self-transition', () => {
      expect(() => assertAppointmentTransition('in_service', 'in_service')).toThrow(AppError);
    });

    it('throws for backward transition', () => {
      expect(() => assertAppointmentTransition('in_service', 'checked_in')).toThrow(AppError);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// isTerminalStatus
// ══════════════════════════════════════════════════════════════════

describe('isTerminalStatus', () => {
  it('returns true for checked_out', () => {
    expect(isTerminalStatus('checked_out')).toBe(true);
  });

  it('returns true for canceled', () => {
    expect(isTerminalStatus('canceled')).toBe(true);
  });

  it('returns true for no_show', () => {
    expect(isTerminalStatus('no_show')).toBe(true);
  });

  it('returns false for scheduled', () => {
    expect(isTerminalStatus('scheduled')).toBe(false);
  });

  it('returns false for confirmed', () => {
    expect(isTerminalStatus('confirmed')).toBe(false);
  });

  it('returns false for checked_in', () => {
    expect(isTerminalStatus('checked_in')).toBe(false);
  });

  it('returns false for in_service', () => {
    expect(isTerminalStatus('in_service')).toBe(false);
  });

  it('returns false for completed', () => {
    expect(isTerminalStatus('completed')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// isActiveStatus
// ══════════════════════════════════════════════════════════════════

describe('isActiveStatus', () => {
  it('returns true for scheduled', () => {
    expect(isActiveStatus('scheduled')).toBe(true);
  });

  it('returns true for confirmed', () => {
    expect(isActiveStatus('confirmed')).toBe(true);
  });

  it('returns true for checked_in', () => {
    expect(isActiveStatus('checked_in')).toBe(true);
  });

  it('returns true for in_service', () => {
    expect(isActiveStatus('in_service')).toBe(true);
  });

  it('returns false for completed', () => {
    expect(isActiveStatus('completed')).toBe(false);
  });

  it('returns false for checked_out', () => {
    expect(isActiveStatus('checked_out')).toBe(false);
  });

  it('returns false for canceled', () => {
    expect(isActiveStatus('canceled')).toBe(false);
  });

  it('returns false for no_show', () => {
    expect(isActiveStatus('no_show')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// getEventTypeForTransition
// ══════════════════════════════════════════════════════════════════

describe('getEventTypeForTransition', () => {
  it('returns APPOINTMENT_CONFIRMED for confirmed', () => {
    expect(getEventTypeForTransition('confirmed')).toBe(SPA_EVENTS.APPOINTMENT_CONFIRMED);
  });

  it('returns APPOINTMENT_CHECKED_IN for checked_in', () => {
    expect(getEventTypeForTransition('checked_in')).toBe(SPA_EVENTS.APPOINTMENT_CHECKED_IN);
  });

  it('returns APPOINTMENT_SERVICE_STARTED for in_service', () => {
    expect(getEventTypeForTransition('in_service')).toBe(SPA_EVENTS.APPOINTMENT_SERVICE_STARTED);
  });

  it('returns APPOINTMENT_COMPLETED for completed', () => {
    expect(getEventTypeForTransition('completed')).toBe(SPA_EVENTS.APPOINTMENT_COMPLETED);
  });

  it('returns APPOINTMENT_CHECKED_OUT for checked_out', () => {
    expect(getEventTypeForTransition('checked_out')).toBe(SPA_EVENTS.APPOINTMENT_CHECKED_OUT);
  });

  it('returns APPOINTMENT_CANCELED for canceled', () => {
    expect(getEventTypeForTransition('canceled')).toBe(SPA_EVENTS.APPOINTMENT_CANCELED);
  });

  it('returns APPOINTMENT_NO_SHOW for no_show', () => {
    expect(getEventTypeForTransition('no_show')).toBe(SPA_EVENTS.APPOINTMENT_NO_SHOW);
  });

  it('returns null for scheduled (initial creation, not a transition)', () => {
    expect(getEventTypeForTransition('scheduled')).toBeNull();
  });

  it('returns null for an unknown status', () => {
    expect(getEventTypeForTransition('unknown' as AppointmentStatus)).toBeNull();
  });

  it('event strings follow spa.appointment.*.v1 naming convention', () => {
    const transitionStatuses: AppointmentStatus[] = [
      'confirmed', 'checked_in', 'in_service', 'completed',
      'checked_out', 'canceled', 'no_show',
    ];
    for (const status of transitionStatuses) {
      const event = getEventTypeForTransition(status);
      expect(event).not.toBeNull();
      expect(event!).toMatch(/^spa\.appointment\.[a-z_]+\.v1$/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// getStatusLabel
// ══════════════════════════════════════════════════════════════════

describe('getStatusLabel', () => {
  it('returns "Scheduled" for scheduled', () => {
    expect(getStatusLabel('scheduled')).toBe('Scheduled');
  });

  it('returns "Confirmed" for confirmed', () => {
    expect(getStatusLabel('confirmed')).toBe('Confirmed');
  });

  it('returns "Checked In" for checked_in', () => {
    expect(getStatusLabel('checked_in')).toBe('Checked In');
  });

  it('returns "In Service" for in_service', () => {
    expect(getStatusLabel('in_service')).toBe('In Service');
  });

  it('returns "Completed" for completed', () => {
    expect(getStatusLabel('completed')).toBe('Completed');
  });

  it('returns "Checked Out" for checked_out', () => {
    expect(getStatusLabel('checked_out')).toBe('Checked Out');
  });

  it('returns "Canceled" for canceled', () => {
    expect(getStatusLabel('canceled')).toBe('Canceled');
  });

  it('returns "No Show" for no_show', () => {
    expect(getStatusLabel('no_show')).toBe('No Show');
  });

  it('returns the raw value for an unknown status (fallback)', () => {
    expect(getStatusLabel('mystery_status' as AppointmentStatus)).toBe('mystery_status');
  });
});

// ══════════════════════════════════════════════════════════════════
// APPOINTMENT_TRANSITIONS map
// ══════════════════════════════════════════════════════════════════

describe('APPOINTMENT_TRANSITIONS map', () => {
  it('has an entry for every known status', () => {
    for (const status of ALL_STATUSES) {
      expect(APPOINTMENT_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('every transition target is a valid AppointmentStatus', () => {
    for (const [_from, targets] of Object.entries(APPOINTMENT_TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it('no status lists itself as a valid transition target', () => {
    for (const [from, targets] of Object.entries(APPOINTMENT_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });

  it('no status has duplicate transition targets', () => {
    for (const [_from, targets] of Object.entries(APPOINTMENT_TRANSITIONS)) {
      const unique = new Set(targets);
      expect(unique.size).toBe(targets.length);
    }
  });

  it('scheduled has 4 transitions', () => {
    expect(APPOINTMENT_TRANSITIONS.scheduled).toHaveLength(4);
  });

  it('confirmed has 3 transitions', () => {
    expect(APPOINTMENT_TRANSITIONS.confirmed).toHaveLength(3);
  });

  it('checked_in has 2 transitions', () => {
    expect(APPOINTMENT_TRANSITIONS.checked_in).toHaveLength(2);
  });

  it('in_service has 1 transition', () => {
    expect(APPOINTMENT_TRANSITIONS.in_service).toHaveLength(1);
  });

  it('completed has 1 transition', () => {
    expect(APPOINTMENT_TRANSITIONS.completed).toHaveLength(1);
  });

  it('terminal states have 0 transitions', () => {
    expect(APPOINTMENT_TRANSITIONS.checked_out).toHaveLength(0);
    expect(APPOINTMENT_TRANSITIONS.canceled).toHaveLength(0);
    expect(APPOINTMENT_TRANSITIONS.no_show).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Exported constant arrays
// ══════════════════════════════════════════════════════════════════

describe('ACTIVE_APPOINTMENT_STATUSES', () => {
  it('contains exactly 4 statuses', () => {
    expect(ACTIVE_APPOINTMENT_STATUSES).toHaveLength(4);
  });

  it('contains scheduled, confirmed, checked_in, in_service', () => {
    expect(ACTIVE_APPOINTMENT_STATUSES).toContain('scheduled');
    expect(ACTIVE_APPOINTMENT_STATUSES).toContain('confirmed');
    expect(ACTIVE_APPOINTMENT_STATUSES).toContain('checked_in');
    expect(ACTIVE_APPOINTMENT_STATUSES).toContain('in_service');
  });

  it('does not contain terminal or completed statuses', () => {
    expect(ACTIVE_APPOINTMENT_STATUSES).not.toContain('completed');
    expect(ACTIVE_APPOINTMENT_STATUSES).not.toContain('checked_out');
    expect(ACTIVE_APPOINTMENT_STATUSES).not.toContain('canceled');
    expect(ACTIVE_APPOINTMENT_STATUSES).not.toContain('no_show');
  });
});

describe('TERMINAL_STATUSES', () => {
  it('contains exactly 3 statuses', () => {
    expect(TERMINAL_STATUSES).toHaveLength(3);
  });

  it('contains checked_out, canceled, no_show', () => {
    expect(TERMINAL_STATUSES).toContain('checked_out');
    expect(TERMINAL_STATUSES).toContain('canceled');
    expect(TERMINAL_STATUSES).toContain('no_show');
  });

  it('does not overlap with active statuses', () => {
    for (const ts of TERMINAL_STATUSES) {
      expect(ACTIVE_APPOINTMENT_STATUSES).not.toContain(ts);
    }
  });
});

describe('CONFLICT_EXCLUDED_STATUSES', () => {
  it('contains exactly 3 statuses', () => {
    expect(CONFLICT_EXCLUDED_STATUSES).toHaveLength(3);
  });

  it('contains canceled, no_show, checked_out', () => {
    expect(CONFLICT_EXCLUDED_STATUSES).toContain('canceled');
    expect(CONFLICT_EXCLUDED_STATUSES).toContain('no_show');
    expect(CONFLICT_EXCLUDED_STATUSES).toContain('checked_out');
  });

  it('matches terminal statuses exactly (same set)', () => {
    const conflictSet = new Set(CONFLICT_EXCLUDED_STATUSES);
    const terminalSet = new Set(TERMINAL_STATUSES);
    expect(conflictSet).toEqual(terminalSet);
  });
});

// ══════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('canTransitionAppointment with unknown from status returns false', () => {
    // canTransitionAppointment relies on APPOINTMENT_TRANSITIONS[from].
    // An unknown key yields undefined, and `undefined?.includes()` returns undefined,
    // but the `allowed != null` guard catches it.
    expect(canTransitionAppointment('bogus' as AppointmentStatus, 'confirmed')).toBe(false);
  });

  it('canTransitionAppointment with unknown to status returns false', () => {
    expect(canTransitionAppointment('scheduled', 'bogus' as AppointmentStatus)).toBe(false);
  });

  it('assertAppointmentTransition throws for unknown from status', () => {
    expect(() => assertAppointmentTransition('bogus' as AppointmentStatus, 'confirmed'))
      .toThrow(AppError);
  });

  it('isTerminalStatus returns false for unknown status', () => {
    // APPOINTMENT_TRANSITIONS['unknown'] is undefined, so ?.length is undefined.
    // undefined === 0 is false.
    expect(isTerminalStatus('unknown' as AppointmentStatus)).toBe(false);
  });

  it('isActiveStatus returns false for unknown status', () => {
    expect(isActiveStatus('unknown' as AppointmentStatus)).toBe(false);
  });

  it('getStatusLabel returns raw string for empty-ish unknown status', () => {
    expect(getStatusLabel('' as AppointmentStatus)).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════
// Full lifecycle path validation
// ══════════════════════════════════════════════════════════════════

describe('full lifecycle paths', () => {
  it('happy path: scheduled -> confirmed -> checked_in -> in_service -> completed -> checked_out', () => {
    const path: AppointmentStatus[] = [
      'scheduled', 'confirmed', 'checked_in', 'in_service', 'completed', 'checked_out',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionAppointment(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('walk-in path: scheduled -> checked_in -> in_service -> completed -> checked_out', () => {
    const path: AppointmentStatus[] = [
      'scheduled', 'checked_in', 'in_service', 'completed', 'checked_out',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionAppointment(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('early cancel path: scheduled -> canceled', () => {
    expect(canTransitionAppointment('scheduled', 'canceled')).toBe(true);
    expect(isTerminalStatus('canceled')).toBe(true);
  });

  it('no-show path: confirmed -> no_show', () => {
    expect(canTransitionAppointment('confirmed', 'no_show')).toBe(true);
    expect(isTerminalStatus('no_show')).toBe(true);
  });

  it('late cancel path: checked_in -> canceled', () => {
    expect(canTransitionAppointment('checked_in', 'canceled')).toBe(true);
    expect(isTerminalStatus('canceled')).toBe(true);
  });

  it('final state in happy path is terminal', () => {
    expect(isTerminalStatus('checked_out')).toBe(true);
  });

  it('completed is NOT terminal (must check out)', () => {
    expect(isTerminalStatus('completed')).toBe(false);
  });
});
