import { describe, it, expect } from 'vitest';
import {
  computeDaypart,
  computeTurnTimeMinutes,
  incrementalAvg,
  computeTipPercentage,
  DAYPART_RANGES,
} from '../helpers/fnb-reporting-utils';

describe('computeDaypart', () => {
  it('returns breakfast for hours 5-10', () => {
    expect(computeDaypart(5)).toBe('breakfast');
    expect(computeDaypart(7)).toBe('breakfast');
    expect(computeDaypart(10)).toBe('breakfast');
  });

  it('returns lunch for hours 11-15', () => {
    expect(computeDaypart(11)).toBe('lunch');
    expect(computeDaypart(12)).toBe('lunch');
    expect(computeDaypart(15)).toBe('lunch');
  });

  it('returns dinner for hours 16-21', () => {
    expect(computeDaypart(16)).toBe('dinner');
    expect(computeDaypart(18)).toBe('dinner');
    expect(computeDaypart(21)).toBe('dinner');
  });

  it('returns late_night for hours 22-23 and 0-4', () => {
    expect(computeDaypart(22)).toBe('late_night');
    expect(computeDaypart(23)).toBe('late_night');
    expect(computeDaypart(0)).toBe('late_night');
    expect(computeDaypart(1)).toBe('late_night');
    expect(computeDaypart(4)).toBe('late_night');
  });
});

describe('computeTurnTimeMinutes', () => {
  it('computes minutes between two timestamps', () => {
    const opened = '2026-02-21T12:00:00Z';
    const closed = '2026-02-21T13:30:00Z';
    expect(computeTurnTimeMinutes(opened, closed)).toBe(90);
  });

  it('returns null if openedAt is null', () => {
    expect(computeTurnTimeMinutes(null, '2026-02-21T13:00:00Z')).toBeNull();
  });

  it('returns null if closedAt is null', () => {
    expect(computeTurnTimeMinutes('2026-02-21T12:00:00Z', null)).toBeNull();
  });

  it('returns null if diff is negative', () => {
    expect(computeTurnTimeMinutes('2026-02-21T14:00:00Z', '2026-02-21T12:00:00Z')).toBeNull();
  });

  it('returns 0 for same time', () => {
    const ts = '2026-02-21T12:00:00Z';
    expect(computeTurnTimeMinutes(ts, ts)).toBe(0);
  });

  it('rounds to nearest minute', () => {
    const opened = '2026-02-21T12:00:00Z';
    const closed = '2026-02-21T12:45:30Z';
    expect(computeTurnTimeMinutes(opened, closed)).toBe(46); // 45.5 rounds to 46
  });
});

describe('incrementalAvg', () => {
  it('returns newValue when count is 0', () => {
    expect(incrementalAvg(0, 0, 100)).toBe(100);
  });

  it('computes running average correctly', () => {
    // Starting avg=10, count=1, adding 20 → (10+20)/2 = 15
    const result = incrementalAvg(10, 1, 20);
    expect(result).toBe(15);
  });

  it('computes average with larger count', () => {
    // avg=10, count=9, adding 20 → 10 + (20-10)/10 = 11
    const result = incrementalAvg(10, 9, 20);
    expect(result).toBe(11);
  });

  it('handles negative count as fresh start', () => {
    expect(incrementalAvg(50, -1, 100)).toBe(100);
  });
});

describe('computeTipPercentage', () => {
  it('computes tip percentage', () => {
    expect(computeTipPercentage(15, 100)).toBe(15);
  });

  it('returns null for zero sales', () => {
    expect(computeTipPercentage(10, 0)).toBeNull();
  });

  it('returns null for negative sales', () => {
    expect(computeTipPercentage(10, -5)).toBeNull();
  });

  it('handles fractional percentages', () => {
    expect(computeTipPercentage(18.5, 100)).toBe(18.5);
  });

  it('rounds to 2 decimal places', () => {
    const result = computeTipPercentage(1, 3);
    expect(result).toBe(33.33);
  });
});

describe('DAYPART_RANGES', () => {
  it('has all 4 dayparts', () => {
    expect(Object.keys(DAYPART_RANGES)).toHaveLength(4);
    expect(DAYPART_RANGES).toHaveProperty('breakfast');
    expect(DAYPART_RANGES).toHaveProperty('lunch');
    expect(DAYPART_RANGES).toHaveProperty('dinner');
    expect(DAYPART_RANGES).toHaveProperty('late_night');
  });

  it('breakfast ranges from 5 to 11', () => {
    expect(DAYPART_RANGES.breakfast.start).toBe(5);
    expect(DAYPART_RANGES.breakfast.end).toBe(11);
  });

  it('dinner ranges from 16 to 22', () => {
    expect(DAYPART_RANGES.dinner.start).toBe(16);
    expect(DAYPART_RANGES.dinner.end).toBe(22);
  });

  it('late_night wraps around midnight', () => {
    expect(DAYPART_RANGES.late_night.start).toBe(22);
    expect(DAYPART_RANGES.late_night.end).toBe(5);
  });
});
