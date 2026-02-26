import { describe, it, expect } from 'vitest';
import { scoreRoom, rankRooms } from '../helpers/room-assignment-engine';
import type { ScoredRoom, AssignmentContext, PreferenceWeight } from '../helpers/room-assignment-engine';

const makeRoom = (overrides: Partial<ScoredRoom> = {}): ScoredRoom => ({
  id: 'room-1',
  roomNumber: '101',
  roomTypeId: 'rt-standard',
  floor: '1',
  viewType: 'garden',
  wing: 'east',
  accessibilityJson: {},
  connectingRoomIds: [],
  ...overrides,
});

const baseContext: AssignmentContext = {
  guestPreferences: {},
  isVip: false,
  isRepeatGuest: false,
  roomTypeId: 'rt-standard',
};

const defaultWeights: PreferenceWeight[] = [
  { name: 'floor_preference', weight: 30 },
  { name: 'view', weight: 25 },
  { name: 'quiet', weight: 20 },
  { name: 'accessibility', weight: 40 },
  { name: 'wing', weight: 15 },
];

describe('scoreRoom', () => {
  it('returns 0 score with no preferences', () => {
    const result = scoreRoom(makeRoom(), baseContext, defaultWeights);
    expect(result.score).toBe(0);
    expect(result.reasons).toHaveLength(0);
  });

  describe('floor preference', () => {
    it('adds floor weight when floor matches', () => {
      const ctx = { ...baseContext, guestPreferences: { floor: '1' } };
      const result = scoreRoom(makeRoom({ floor: '1' }), ctx, defaultWeights);
      expect(result.score).toBe(30);
      expect(result.reasons).toContain('Floor match: 1');
    });

    it('does not add score when floor does not match', () => {
      const ctx = { ...baseContext, guestPreferences: { floor: '3' } };
      const result = scoreRoom(makeRoom({ floor: '1' }), ctx, defaultWeights);
      expect(result.score).toBe(0);
    });

    it('skips floor scoring when room has no floor', () => {
      const ctx = { ...baseContext, guestPreferences: { floor: '1' } };
      const result = scoreRoom(makeRoom({ floor: null }), ctx, defaultWeights);
      expect(result.score).toBe(0);
    });
  });

  describe('view preference', () => {
    it('adds view weight when view matches', () => {
      const ctx = { ...baseContext, guestPreferences: { view: 'garden' } };
      const result = scoreRoom(makeRoom({ viewType: 'garden' }), ctx, defaultWeights);
      expect(result.score).toBe(25);
      expect(result.reasons).toContain('View match: garden');
    });

    it('does not add score when view does not match', () => {
      const ctx = { ...baseContext, guestPreferences: { view: 'ocean' } };
      const result = scoreRoom(makeRoom({ viewType: 'garden' }), ctx, defaultWeights);
      expect(result.score).toBe(0);
    });
  });

  describe('quiet preference', () => {
    it('adds quiet weight for high floor (>= 3)', () => {
      const ctx = { ...baseContext, guestPreferences: { quiet: true } };
      const result = scoreRoom(makeRoom({ floor: '5' }), ctx, defaultWeights);
      expect(result.score).toBe(20);
      expect(result.reasons.some(r => r.includes('Quiet'))).toBe(true);
    });

    it('adds quiet weight for preferred wing', () => {
      const ctx = { ...baseContext, guestPreferences: { quiet: true, quietWings: ['east'] } };
      const result = scoreRoom(makeRoom({ floor: '1', wing: 'east' }), ctx, defaultWeights);
      expect(result.score).toBe(20);
    });

    it('does not add score when not wanting quiet', () => {
      const ctx = { ...baseContext, guestPreferences: { quiet: false } };
      const result = scoreRoom(makeRoom({ floor: '5' }), ctx, defaultWeights);
      expect(result.score).toBe(0);
    });
  });

  describe('accessibility', () => {
    it('adds weight when all accessibility needs met', () => {
      const room = makeRoom({ accessibilityJson: { wheelchair: true, hearing: true } });
      const ctx = { ...baseContext, guestPreferences: { accessibility: { wheelchair: true } } };
      const result = scoreRoom(room, ctx, defaultWeights);
      expect(result.score).toBe(40);
      expect(result.reasons).toContain('Accessibility needs met');
    });

    it('penalizes when accessibility needs not met', () => {
      const room = makeRoom({ accessibilityJson: {} });
      const ctx = { ...baseContext, guestPreferences: { accessibility: { wheelchair: true } } };
      const result = scoreRoom(room, ctx, defaultWeights);
      expect(result.score).toBe(-40);
      expect(result.reasons).toContain('Accessibility needs NOT met (penalty)');
    });

    it('no effect when accessibility needs are false', () => {
      const room = makeRoom({ accessibilityJson: {} });
      const ctx = { ...baseContext, guestPreferences: { accessibility: { wheelchair: false } } };
      const result = scoreRoom(room, ctx, defaultWeights);
      expect(result.score).toBe(0);
    });
  });

  describe('wing preference', () => {
    it('adds wing weight when wing matches', () => {
      const ctx = { ...baseContext, guestPreferences: { wing: 'east' } };
      const result = scoreRoom(makeRoom({ wing: 'east' }), ctx, defaultWeights);
      expect(result.score).toBe(15);
      expect(result.reasons).toContain('Wing match: east');
    });
  });

  describe('VIP and repeat guest bonuses', () => {
    it('adds VIP bonus of 20', () => {
      const ctx = { ...baseContext, isVip: true };
      const result = scoreRoom(makeRoom(), ctx, defaultWeights);
      expect(result.score).toBe(20);
      expect(result.reasons).toContain('VIP bonus: +20');
    });

    it('adds repeat guest bonus of 10', () => {
      const ctx = { ...baseContext, isRepeatGuest: true };
      const result = scoreRoom(makeRoom(), ctx, defaultWeights);
      expect(result.score).toBe(10);
      expect(result.reasons).toContain('Repeat guest bonus: +10');
    });

    it('stacks VIP and repeat bonuses', () => {
      const ctx = { ...baseContext, isVip: true, isRepeatGuest: true };
      const result = scoreRoom(makeRoom(), ctx, defaultWeights);
      expect(result.score).toBe(30);
    });
  });

  describe('combined scoring', () => {
    it('sums all matching preferences', () => {
      const ctx: AssignmentContext = {
        guestPreferences: { floor: '5', view: 'garden', quiet: true, wing: 'east' },
        isVip: true,
        isRepeatGuest: true,
        roomTypeId: 'rt-standard',
      };
      const room = makeRoom({ floor: '5', viewType: 'garden', wing: 'east' });
      const result = scoreRoom(room, ctx, defaultWeights);
      // floor(30) + view(25) + quiet-high-floor(20) + wing(15) + VIP(20) + repeat(10) = 120
      expect(result.score).toBe(120);
    });
  });
});

describe('rankRooms', () => {
  it('filters to matching room type only', () => {
    const rooms = [
      makeRoom({ id: 'r1', roomTypeId: 'rt-standard' }),
      makeRoom({ id: 'r2', roomTypeId: 'rt-suite' }),
    ];
    const results = rankRooms(rooms, baseContext, []);
    expect(results).toHaveLength(1);
    expect(results[0]!.roomId).toBe('r1');
  });

  it('sorts by score descending', () => {
    const rooms = [
      makeRoom({ id: 'r1', floor: '1' }),
      makeRoom({ id: 'r2', floor: '5' }),
    ];
    const ctx = { ...baseContext, guestPreferences: { quiet: true } };
    const results = rankRooms(rooms, ctx, defaultWeights);
    expect(results[0]!.roomId).toBe('r2'); // higher floor gets quiet bonus
  });

  it('breaks ties by roomId', () => {
    const rooms = [
      makeRoom({ id: 'r-b' }),
      makeRoom({ id: 'r-a' }),
    ];
    const results = rankRooms(rooms, baseContext, []);
    expect(results[0]!.roomId).toBe('r-a');
    expect(results[1]!.roomId).toBe('r-b');
  });

  it('returns empty for no matching rooms', () => {
    const rooms = [makeRoom({ roomTypeId: 'rt-suite' })];
    const results = rankRooms(rooms, baseContext, []);
    expect(results).toHaveLength(0);
  });
});
