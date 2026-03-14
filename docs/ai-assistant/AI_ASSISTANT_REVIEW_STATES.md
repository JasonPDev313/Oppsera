# AI Assistant — Review States

## State Machine

```
new
 └─► pending_review
       ├─► approved         → promote to Approved Answer Memory (T2)
       ├─► edited           → create / update answer card with corrected version → promote to T2
       ├─► rejected         → blocked from memory ("do not learn from" applies)
       └─► needs_kb_update  → manifest or answer card gap identified → requires KB update before re-review
```

---

## States

| State | Description | Memory Outcome |
|---|---|---|
| `new` | Answer just generated; no review action taken yet | Not in memory |
| `pending_review` | Flagged for human review (auto or manual trigger) | Not in memory |
| `approved` | Reviewer confirmed the answer is correct | Promoted to Approved Answer Memory (T2) |
| `edited` | Reviewer corrected the answer | Corrected version creates or updates an answer card; promoted to T2 |
| `rejected` | Answer was wrong or harmful | Blocked from memory; "do not learn from" rule applied |
| `needs_kb_update` | Answer exposed a gap in the knowledge base | No promotion until manifest or answer card is updated and re-reviewed |

---

## Auto-Flag Triggers

The following conditions automatically move an answer from `new` to `pending_review`:

| Trigger | Condition |
|---|---|
| Low confidence | `confidence: 'low'` (score < 0.5) |
| Thumbs-down feedback | User rates answer negatively |
| Repeated miss | Same screen or question pattern escalated 3+ times without a resolved outcome |
| No retrieval evidence | `sourceTierUsed: 'none'` — answer had no grounding |
| Staff escalation | Staff member manually flags the answer for review |

---

## Reviewer Actions

| Action | Result State | Notes |
|---|---|---|
| Confirm correct | `approved` | Promotes answer as-is to T2 |
| Correct and save | `edited` | Stores corrected version; original is not promoted |
| Reject | `rejected` | Blocks answer from memory; logs rejection reason |
| Mark KB gap | `needs_kb_update` | Flags a manifest or answer card as incomplete; triggers KB team workflow |

---

## Conversation Taxonomy

Every conversation is tagged for analytics and review routing.

### Question Type

| Tag | Description |
|---|---|
| `how_to` | User is asking how to complete a task |
| `explain` | User is asking what something is or does |
| `diagnose` | User is asking why something is happening or unavailable |
| `permissions` | User is asking why they can't access or perform an action |
| `bug_suspicion` | User believes they have encountered a product bug |
| `billing` | User has a billing or payment question (always escalated) |
| `reporting` | User is asking about data, reports, or metrics |

### Outcome

| Tag | Description |
|---|---|
| `resolved` | User question answered; no further action needed |
| `escalated` | Answer mode was `escalate`; user directed to next step |
| `reviewed` | Conversation entered the review queue |
| `unresolved` | Conversation ended without a satisfactory resolution |

### Issue Tag (for escalated / reviewed conversations)

| Tag | Description |
|---|---|
| `probable_bug` | Behavior described suggests a product defect |
| `probable_config` | Behavior is likely caused by a misconfigured setting |
| `probable_permissions` | Behavior is likely caused by a missing role or permission |
| `probable_misunderstanding` | User may have misunderstood how the feature works |

---

## Answer Card Structure

When an answer reaches `edited` or is manually authored for `needs_kb_update`, an answer card is created or updated with:

| Field | Description |
|---|---|
| `question` | Canonical question text (normalized) |
| `answer` | Approved answer text |
| `answerMode` | explain / guide / diagnose |
| `steps` | Ordered steps if guide mode |
| `applicableScreens` | Route or screen context(s) this answer applies to |
| `applicableModules` | Module(s) this answer relates to |
| `tenantScoped` | `true` if this answer applies only to a specific tenant |
| `reviewedBy` | Reviewer identifier |
| `reviewedAt` | Timestamp of approval or edit |
| `sourceSHA` | Manifest SHA at time of review (for staleness tracking) |
