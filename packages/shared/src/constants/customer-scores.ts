/**
 * Customer Score Types & RFM Segment Definitions
 *
 * Used by the RFM scoring engine and predictive metrics service
 * to compute and store customer intelligence scores.
 */

// ── Score Types ──────────────────────────────────────────────────────────────

export const SCORE_TYPES = {
  RFM: 'rfm',
  RFM_RECENCY: 'rfm_recency',
  RFM_FREQUENCY: 'rfm_frequency',
  RFM_MONETARY: 'rfm_monetary',
  CHURN_RISK: 'churn_risk',
  PREDICTED_CLV: 'predicted_clv',
  SPEND_VELOCITY: 'spend_velocity',
  DAYS_UNTIL_PREDICTED_VISIT: 'days_until_predicted_visit',
} as const;

export type ScoreType = (typeof SCORE_TYPES)[keyof typeof SCORE_TYPES];

// ── RFM Segments ─────────────────────────────────────────────────────────────

export type RfmSegment =
  | 'champions'
  | 'loyal_customers'
  | 'potential_loyalists'
  | 'recent_customers'
  | 'promising'
  | 'needs_attention'
  | 'about_to_sleep'
  | 'at_risk'
  | 'cant_lose_them'
  | 'hibernating'
  | 'lost';

export interface RfmSegmentDef {
  key: RfmSegment;
  label: string;
  description: string;
  /** RFM score tuples that map to this segment (R, F, M each 1-5) */
  scoreTuples: [number, number, number][];
  /** Composite score range (R*F*M), used as fallback when no tuple matches */
  compositeRange: [number, number];
}

/**
 * RFM Segment definitions ordered from best to worst.
 * Score tuples are the primary classifier; compositeRange is a fallback.
 */
export const RFM_SEGMENTS: RfmSegmentDef[] = [
  {
    key: 'champions',
    label: 'Champions',
    description: 'Best customers — recent, frequent, high-spending',
    scoreTuples: [[5, 5, 5], [5, 5, 4], [5, 4, 4], [5, 4, 5]],
    compositeRange: [100, 125],
  },
  {
    key: 'loyal_customers',
    label: 'Loyal Customers',
    description: 'Frequent buyers with solid spend',
    scoreTuples: [[5, 4, 3], [5, 3, 4], [5, 3, 3], [4, 4, 3], [4, 3, 4], [4, 3, 3]],
    compositeRange: [80, 99],
  },
  {
    key: 'potential_loyalists',
    label: 'Potential Loyalists',
    description: 'Recent customers with growing frequency',
    scoreTuples: [[5, 5, 3], [5, 5, 1], [5, 5, 2], [5, 4, 1], [5, 4, 2]],
    compositeRange: [60, 79],
  },
  {
    key: 'recent_customers',
    label: 'Recent Customers',
    description: 'New visitors with low frequency',
    scoreTuples: [[5, 1, 2], [5, 1, 1], [5, 2, 1]],
    compositeRange: [50, 59],
  },
  {
    key: 'promising',
    label: 'Promising',
    description: 'Recent but moderate engagement',
    scoreTuples: [[5, 2, 5], [5, 2, 4], [5, 2, 3], [4, 2, 3]],
    compositeRange: [40, 49],
  },
  {
    key: 'needs_attention',
    label: 'Needs Attention',
    description: 'Above-average but slipping',
    scoreTuples: [[4, 4, 2], [4, 4, 1], [4, 3, 2], [4, 2, 1], [3, 3, 3]],
    compositeRange: [30, 39],
  },
  {
    key: 'about_to_sleep',
    label: 'About To Sleep',
    description: 'Below average recency & frequency',
    scoreTuples: [[3, 3, 1], [3, 2, 1], [3, 1, 2]],
    compositeRange: [20, 29],
  },
  {
    key: 'at_risk',
    label: 'At Risk',
    description: 'Made purchases but dormant',
    scoreTuples: [[2, 5, 5], [2, 5, 4], [2, 4, 5], [2, 4, 4]],
    compositeRange: [15, 19],
  },
  {
    key: 'cant_lose_them',
    label: "Can't Lose Them",
    description: 'Used to be top customers, drifting away',
    scoreTuples: [[1, 5, 5], [1, 5, 4], [1, 4, 4]],
    compositeRange: [10, 14],
  },
  {
    key: 'hibernating',
    label: 'Hibernating',
    description: 'Low activity for extended period',
    scoreTuples: [[2, 2, 2], [2, 2, 1], [2, 1, 1]],
    compositeRange: [5, 9],
  },
  {
    key: 'lost',
    label: 'Lost',
    description: 'Lowest scores across all dimensions',
    scoreTuples: [[1, 1, 1], [1, 1, 2], [1, 2, 1]],
    compositeRange: [1, 4],
  },
];

/**
 * Score tuple → segment lookup map (precomputed for O(1) lookups).
 * Key format: "R-F-M" e.g. "5-5-5"
 */
const _tupleMap = new Map<string, RfmSegment>();
for (const seg of RFM_SEGMENTS) {
  for (const [r, f, m] of seg.scoreTuples) {
    _tupleMap.set(`${r}-${f}-${m}`, seg.key);
  }
}

/**
 * Get the RFM segment for a given (R, F, M) score tuple.
 * Falls back to composite range matching if no exact tuple match.
 */
export function getRfmSegment(r: number, f: number, m: number): RfmSegment {
  const key = `${r}-${f}-${m}`;
  const exact = _tupleMap.get(key);
  if (exact) return exact;

  // Fallback: use composite score range
  const composite = r * f * m;
  for (const seg of RFM_SEGMENTS) {
    const [lo, hi] = seg.compositeRange;
    if (composite >= lo && composite <= hi) return seg.key;
  }

  // Ultimate fallback based on composite magnitude
  if (composite >= 60) return 'loyal_customers';
  if (composite >= 30) return 'needs_attention';
  if (composite >= 10) return 'hibernating';
  return 'lost';
}

/**
 * Get the human-readable label for a segment key.
 */
export function getRfmSegmentLabel(segment: RfmSegment): string {
  const def = RFM_SEGMENTS.find((s) => s.key === segment);
  return def?.label ?? segment;
}
