# AI Assistant — Product Requirements Document

## Overview

OppsEra AI Assistant is an in-product support agent embedded in the OppsEra SaaS ERP. It answers operational questions from end users in real time, reducing support ticket volume and accelerating onboarding. It is not a chatbot for general conversation — it is a focused support agent scoped to OppsEra features and workflows.

---

## Jobs to Be Done

| User Question Type | Example | Expected Outcome |
|---|---|---|
| "What does this do?" | "What is the Course field on this ticket?" | Explain screen element or feature |
| "How do I?" | "How do I apply a discount to a table?" | Step-by-step workflow guide |
| "Why is this?" | "Why is the Void button greyed out?" | Diagnose state, permissions, or config |
| "I'm confused / something's wrong" | "This total looks wrong" | Structured escalation or known-unknowns |

---

## Target Users

| Role | Mode | Notes |
|---|---|---|
| Cashier | Staff | Daily POS operations, quick how-to answers |
| Server | Staff | F&B workflows, KDS, ticket management |
| Supervisor | Staff | Approvals, overrides, reports |
| Manager | Staff | Config, staff management, reporting |
| Customer (kiosk / self-service) | Customer | Menu questions, order status only |

**Not the target**: Developers, platform admins, implementation consultants.

---

## Answer Modes

### 1. Explain
Describes what a screen, field, or feature does. Triggered when the user asks "what is" or "what does."

### 2. Guide
Provides numbered step-by-step instructions for completing a workflow. Triggered when the user asks "how do I" or "how to."

### 3. Diagnose
Explains why something appears disabled, missing, or behaving unexpectedly. Pulls from permissions, feature flags, and config context. Triggered when the user asks "why is" or "why can't I."

### 4. Escalate
Used when confidence is low or the question falls outside answerable scope (billing, legal, roadmap). Returns a structured known-unknowns block and recommends a next step.

---

## Operating Modes

### Staff Mode
- Access to T1–T7 source tiers (including raw code commentary, internal module names, diagnostic detail)
- May surface permission names, setting keys, and config paths for diagnostics
- Intended for manager/supervisor/cashier/server roles

### Customer Mode
- Access restricted to T1–T6 only (T7 raw code is prohibited)
- No exposure of: code, API endpoints, internal module names, database schema, setting keys, permission strings
- No references to feature flags or internal config
- Answers scoped to what the customer can see and do from the customer-facing surface

---

## Key Features

| Feature | Description |
|---|---|
| Screen-aware context | The assistant receives the current route, active module, and visible UI component names as context |
| Streaming answers | Answers stream token-by-token to minimize perceived latency |
| Confidence scoring | Every answer carries a confidence score (high / medium / low) used to gate answer modes |
| Feedback loop | Users can rate answers thumbs-up or thumbs-down |
| Admin review queue | Low-confidence and thumbs-down answers are queued for human review |
| Approved Answer Memory | Reviewed and approved answers are promoted to a curated knowledge store and preferred in future retrieval |
| Known-unknowns escalation | Low-confidence responses surface what is known, what may vary, what cannot be confirmed, and a recommended next step |

---

## Out of Scope

The AI Assistant **must not** address:

- Feature requests or product suggestions
- Billing disputes or invoices
- Custom development or integration work
- Roadmap hints or upcoming features
- Legal or compliance advice
- Questions outside the requesting tenant's own context

---

## Success Metrics

| Metric | Target |
|---|---|
| Answer mode accuracy | Correct mode selected ≥ 90% of sessions |
| High/medium confidence rate | ≥ 75% of answered questions |
| Thumbs-up rate | ≥ 80% of rated answers |
| Escalation rate | ≤ 15% of questions reach escalate mode |
| Support ticket deflection | Measurable reduction vs pre-launch baseline |

---

## Scope — Supported Modules

Retail, restaurant (F&B / KDS), memberships, appointments (SPA/PMS), inventory, catalog, orders, payments, customers, reporting. Golf module excluded until non-compete expires (~March 2027).
