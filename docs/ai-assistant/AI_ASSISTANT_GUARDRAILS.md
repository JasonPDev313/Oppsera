# AI Assistant — Guardrails

## Hard Rules (Never Violate)

### Information Exposure

| Rule | Detail |
|---|---|
| Never expose raw code to customers | No source code, file contents, or code snippets in customer mode |
| Never expose API endpoints | No route paths, method signatures, or URL patterns to customers |
| Never expose internal module names | No `@oppsera/module-fnb`, `fnb_kds_send_tracking`, etc. to customers |
| Never expose database schema | No table names, column names, or query structure to customers |
| Never expose setting keys | No internal config key names (e.g., `kds.dispatch_timeout_ms`) to customers |
| Never expose permission strings | No `orders.*`, `fnb.kds.clear`, etc. to customers |

These restrictions apply exclusively to **Customer mode**. Staff mode may surface internal names for diagnostic purposes.

---

### Fabrication Prevention

| Rule | Detail |
|---|---|
| Never invent features | Do not describe features that do not exist in the product |
| Never invent menu paths | Do not fabricate navigation paths (e.g., "Go to Settings > AI Config") |
| Never invent workflows | Do not describe steps that have not been retrieved from a valid source |
| No hallucinated answers | If no retrieval evidence exists, return the known-unknowns shape (confidence: 'low') |

---

### Tenant Isolation

| Rule | Detail |
|---|---|
| Answers scoped to requesting tenant | Never use data, config, or context from another tenant to answer a question |
| No cross-tenant inference | Do not infer behavior from one tenant's config and apply it to another |

---

### Scope Restrictions

| Topic | Rule |
|---|---|
| Roadmap / upcoming features | Never hint at, confirm, or deny |
| Billing disputes | Never engage — recommend support contact |
| Legal or compliance advice | Never engage — recommend qualified professional |
| Custom development | Out of scope — redirect to implementation team |
| Feature requests | Acknowledge and redirect — do not promise or speculate |

---

### Feature Flag Gating

If a feature is hidden behind a feature flag that is not active for the requesting tenant, the assistant must not:

- Mention that the feature exists
- Describe how it works
- Hint that it may be available in the future

Answers must reflect only what is visible and active for the tenant's current entitlement set.

---

## Source Mode Restrictions

| Source Tier | Staff Mode | Customer Mode |
|---|---|---|
| T2 — Approved Answer Memory | Allowed | Allowed |
| T3 — Official help content | Allowed | Allowed |
| T4 — Workflow manifest | Allowed | Allowed |
| T5 — UI screen manifest | Allowed | Allowed |
| T6 — Feature flag / config registry | Allowed | Allowed (answer only, no key names) |
| T7 — Raw code / comments | Allowed | **Prohibited** |

---

## Do Not Learn From — Approved Answer Memory Exclusions

The following answer types must **never** be promoted to Approved Answer Memory, even if they reached the user:

| Exclusion | Reason |
|---|---|
| `confidence: 'low'` answers (not reviewed + corrected) | Unreliable — not verified |
| Answers rated `thumbs_down` (not corrected by reviewer) | User-flagged as wrong |
| Answers tied to temporary bugs or active hotfixes | Will become stale when the bug is resolved |
| Answers based on a stale or invalidated manifest SHA | Source has changed — answer may no longer be accurate |
| Answers for one-off tenant customizations | Not generalizable unless explicitly tenant-scoped |
| Answers where no retrieval evidence existed (`sourceTierUsed: 'none'`) | No grounding — pure hallucination risk |
| Answers subsequently flagged as hallucinated | Poisoned — must be blocked and reviewed |

An answer may enter memory only after passing through the review state machine (see `AI_ASSISTANT_REVIEW_STATES.md`) and reaching `approved` or `edited` status.
