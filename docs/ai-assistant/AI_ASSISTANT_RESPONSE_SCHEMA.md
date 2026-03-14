# AI Assistant — Response Schema

## Response Shapes

The AI Assistant returns one of two response shapes depending on confidence level.

---

## Shape 1 — Standard Answer (High / Medium Confidence)

Returned when the assistant has sufficient retrieval evidence to answer confidently.

```typescript
{
  answer: string;                        // Primary answer text (may be markdown)
  steps?: string[];                      // Ordered steps (guide mode only)
  confidence: 'high' | 'medium';
  answerMode: 'explain' | 'guide' | 'diagnose' | 'escalate';
  usedSources: string[];                 // Source IDs or labels used in retrieval
  sourceTierUsed: 't2' | 't3' | 't4' | 't5' | 't6';  // Highest-trust tier used
  needsReview: boolean;                  // True if auto-flagged for admin review
  suggestedFollowups?: string[];         // Optional follow-up prompts to surface
}
```

### Field Notes

- `answer` — Plain prose or markdown. Never contains raw code, endpoints, or schema in customer mode.
- `steps` — Present only when `answerMode === 'guide'`. Each string is one discrete step.
- `suggestedFollowups` — Up to 3 contextual follow-up questions the user might reasonably ask next.
- `needsReview` — Set to `true` automatically if: confidence is at the lower boundary of 'medium', source tier is T5/T6, or the answer contains a diagnostic guess.

---

## Shape 2 — Known Unknowns Answer (Low Confidence)

Returned when the assistant cannot produce a reliable answer. Forces `answerMode: 'escalate'`.

```typescript
{
  answer: string;                        // Brief honest summary of limitations
  confidence: 'low';
  answerMode: 'escalate';
  knownUnknowns: {
    whatIKnow: string;                   // What can be stated with confidence
    whatMayVary: string;                 // What depends on config, role, or tenant
    whatICantConfirm: string;            // What is uncertain or missing from sources
    recommendedNextStep: string;         // What the user should do next
  };
  needsReview: true;                     // Always true for low-confidence answers
  usedSources: string[];
  sourceTierUsed: string;                // May be 't7' or 'none' if no evidence found
}
```

### Field Notes

- `answer` — Brief acknowledgment of the limitation. Do not guess. Example: "I don't have enough information to answer this reliably."
- `knownUnknowns.recommendedNextStep` — Must be actionable. Examples: "Contact your manager", "Check Settings > Permissions", "Submit a support ticket."
- `needsReview` — Always `true`. Low-confidence answers are never auto-promoted to Approved Answer Memory.

---

## Confidence Thresholds

| Level | Score Range | Behavior |
|---|---|---|
| `high` | ≥ 0.80 | Answer returned directly, `needsReview: false` unless flagged by other rules |
| `medium` | 0.50 – 0.79 | Answer returned, `needsReview` may be `true` depending on tier and content |
| `low` | < 0.50 | Shape 2 returned, `answerMode` forced to `'escalate'`, `needsReview: true` |

---

## Source Tier → Confidence Mapping

| Source Tier | Description | Confidence Ceiling |
|---|---|---|
| T2 | Approved Answer Memory (reviewed + curated) | high |
| T3 | Official in-product help content | high |
| T4 | Structured workflow manifest | high |
| T5 | Auto-extracted UI screen manifest | medium |
| T6 | Inferred from feature flag / config registry | medium |
| T7 | Raw code / comments (staff mode only) | low (floor) |
| none | No retrieval evidence | low (forced escalate) |

When multiple tiers are used, `sourceTierUsed` reports the highest-trust tier (lowest tier number) that contributed a meaningful result.

---

## Answer Mode Selection

| Mode | Trigger Signal | Shape |
|---|---|---|
| `explain` | "what is", "what does", describe | Shape 1 |
| `guide` | "how do I", "how to", "steps to" | Shape 1 with `steps[]` |
| `diagnose` | "why is", "why can't I", disabled/missing UI | Shape 1 |
| `escalate` | confidence < 0.5, billing, legal, roadmap | Shape 2 |
