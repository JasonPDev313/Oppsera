# CLAUDE SESSION PLAN — KDS Order Status

You are acting as a **Principal Product Architect + Staff Full-Stack Engineer + POS/KDS Reliability Systems Designer**.

Your job is to design and implement a new operational control feature called **KDS Order Status**.

This feature is not just a list of KDS tickets. It is a **delivery-tracking, diagnostics, and recovery system** for all KDS sends originating from POS terminals and routed to KDS stations.

The product problem we are solving:
- KDS orders are sometimes getting stuck
- managers and support cannot quickly tell where the failure occurred
- the system lacks a reliable way to verify whether a KDS send was actually received and displayed
- there is no clean operational console to inspect, retry, diagnose, or clear stuck KDS sends

You must design this feature in a way that is:
- production-grade
- multi-tenant safe
- operationally reliable
- auditable
- support-friendly
- manager-friendly
- aligned with the existing app architecture and conventions

You must follow the existing project conventions:
- modular monolith boundaries
- Next.js 15 App Router
- React 19
- TypeScript strict
- Drizzle ORM
- Postgres + RLS
- REST/JSON APIs
- withAuth / withAudit / permission-aware backend patterns
- tenant-scoped queries only
- Zod validation
- optimistic concurrency where appropriate
- outbox/event-driven patterns where appropriate
- no hardcoded tenant logic
- no unsafe delete behavior

---

# FEATURE NAME

**KDS Order Status**

---

# PRODUCT GOAL

Build a manager/support-facing KDS control center that can:
1. show all KDS sends clearly
2. expose the true delivery lifecycle of each send
3. diagnose where failures happen
4. allow safe recovery actions
5. preserve auditability and traceability

This feature should answer, for every KDS send attempt:
- what order/ticket was sent
- which station it was sent to
- which terminal sent it
- which employee initiated it
- when it was sent
- whether it was published successfully
- whether the target KDS client received it
- whether the KDS station actually displayed it
- whether the kitchen interacted with it
- whether it failed, retried, or was manually cleared
- why it failed if it did fail

---

# CRITICAL PRODUCT PRINCIPLE

Do **not** model KDS status as a single vague “sent” flag.

The system must distinguish between:
- the backend deciding to send
- the backend publishing the send
- the KDS client receiving the send
- the KDS UI displaying the send
- the kitchen interacting with the send

A row that only says “Sent” is not enough.

---

# RECOMMENDED STATUS LIFECYCLE

Use a status lifecycle like this:

## Delivery / transmission lifecycle
- `queued`
- `dispatching`
- `sent`
- `delivered`
- `displayed`
- `viewed` (optional if you support first visual interaction)
- `retrying`
- `failed`
- `orphaned`
- `deleted`
- `resolved`

## Operational KDS lifecycle
These may coexist with the delivery lifecycle or be represented separately:
- `new`
- `accepted`
- `cooking`
- `ready`
- `served`
- `recalled`
- `rerouted`

## Important interpretation rules
- `sent` means the backend published the payload successfully
- `delivered` means the target KDS client acknowledged receipt
- `displayed` means the target KDS UI acknowledged render/display success
- `failed` means the send failed before healthy delivery/display
- `orphaned` means final state could not be verified
- `deleted` should almost always mean soft-deleted / cleared, not hard-deleted

---

# ARCHITECTURAL RECOMMENDATION

Do **not** make this just “one order = one row.”

One order may:
- route to multiple stations
- contain multiple courses
- be resent
- be recalled
- be rerouted
- partially fail by station or item group

The main tracked unit should be:

> **one KDS send attempt per order/ticket per station**

That means an order routed to Grill and Salad should create at least two KDS delivery-tracking rows.

---

# CORE DATA MODEL

Design a dedicated persistence model for KDS delivery tracking.

## 1) `kds_order_status`
A row representing one KDS send attempt to one target station.

Recommended fields:
- `id`
- `tenant_id`
- `location_id`
- `order_id`
- `ticket_id`
- `ticket_number_snapshot`
- `course_id` nullable
- `course_number_snapshot` nullable
- `station_id`
- `station_name_snapshot`
- `terminal_id`
- `terminal_name_snapshot`
- `employee_id`
- `employee_name_snapshot`
- `device_id` nullable
- `client_session_id` nullable
- `send_token`
- `prior_send_token` nullable
- `send_type`
- `routing_reason`
- `status`
- `kds_operational_status` nullable
- `status_reason_code` nullable
- `status_reason_detail` nullable
- `payload_checksum`
- `payload_version`
- `queued_at` nullable
- `sent_at` nullable
- `delivered_at` nullable
- `displayed_at` nullable
- `first_interaction_at` nullable
- `completed_at` nullable
- `failed_at` nullable
- `resolved_at` nullable
- `deleted_at` nullable
- `deleted_by_employee_id` nullable
- `delete_reason` nullable
- `retry_count`
- `last_retry_at` nullable
- `source_channel` nullable
- `kds_client_version` nullable
- `transport_latency_ms` nullable
- `render_latency_ms` nullable
- `created_at`
- `updated_at`

## 2) `kds_order_status_events`
Append-only timeline of state changes and diagnostics.

Recommended fields:
- `id`
- `tenant_id`
- `location_id`
- `kds_order_status_id`
- `order_id`
- `ticket_id`
- `station_id`
- `send_token`
- `event_type`
- `event_at`
- `actor_type`
- `actor_id` nullable
- `actor_name_snapshot` nullable
- `metadata_json`
- `created_at`

## 3) `kds_error_logs`
Structured error logging for failures in transport, routing, rendering, ACK timeout, etc.

Recommended fields:
- `id`
- `tenant_id`
- `location_id`
- `kds_order_status_id` nullable
- `send_token` nullable
- `error_code`
- `error_category`
- `error_message`
- `error_detail_json`
- `client_context_json`
- `server_context_json`
- `occurred_at`
- `created_at`

## 4) `kds_station_health`
A lightweight operational health table or derived read model for devices/stations.

Recommended fields:
- `id`
- `tenant_id`
- `location_id`
- `station_id`
- `device_id`
- `device_name_snapshot`
- `client_session_id`
- `is_online`
- `last_heartbeat_at`
- `last_ack_at`
- `last_display_ack_at`
- `client_version`
- `subscription_state`
- `pending_ticket_count`
- `render_failures_today`
- `avg_ack_latency_ms` nullable
- `avg_render_latency_ms` nullable
- `updated_at`

---

# SEND TOKEN REQUIREMENT

Every KDS send attempt must generate a unique **send token**.

The send token should:
- uniquely identify one send attempt
- be included in the outbound payload
- be included in all ACKs
- be included in all diagnostic events and errors
- let support reconstruct the full lifecycle of a send attempt
- let retries create a new token while preserving linkage to the prior attempt

Recommended rule:
- unique per ticket/order + station + send attempt

Do **not** reuse the same token for a retry.

A retry should create:
- a new send token
- a new row or a clear retried state transition pattern
- a link to the original failed attempt

---

# ACKNOWLEDGMENT REQUIREMENTS

The backend publishing an event is **not enough** to count a KDS send as healthy.

Implement at least two acknowledgments from the KDS client.

## 1) Delivery ACK
Sent when the KDS client receives the payload.

This proves:
- the device was connected
- the subscription/channel worked
- the message arrived to the client

## 2) Display ACK
Sent only after the KDS UI successfully renders/inserts the ticket into visible state.

This proves:
- the client not only received the payload
- the UI accepted and displayed it
- client-side filtering or rendering did not silently drop it

Optional:
## 3) First Interaction ACK
Sent on first operator interaction or first time ticket becomes active in the station workflow.

This helps confirm that the kitchen actually encountered the order.

---

# FAILURE CLASSIFICATION

Do not use a generic failed status only.

Use structured error codes like:
- `ROUTING_FAILED`
- `STATION_NOT_FOUND`
- `NO_ACTIVE_KDS_CLIENT`
- `REALTIME_PUBLISH_FAILED`
- `ACK_TIMEOUT`
- `DISPLAY_ACK_TIMEOUT`
- `CLIENT_RENDER_ERROR`
- `FILTERED_OUT_BY_CLIENT`
- `DUPLICATE_TOKEN_REJECTED`
- `PAYLOAD_VALIDATION_FAILED`
- `ORDER_STATE_CONFLICT`
- `NETWORK_DISCONNECTED`
- `SUBSCRIPTION_NOT_ACTIVE`
- `UNKNOWN`

Each failure should support:
- machine-readable code
- category
- human-readable explanation
- structured detail payload

---

# PRIMARY UI SURFACE

Build a new manager/support screen called:

## **KDS Order Status**

This should be a real operational console, not just a static report.

---

# PRIMARY LIST VIEW REQUIREMENTS

Create a searchable/filterable list view of KDS sends.

## Minimum columns
- Status
- Order / Ticket #
- Station
- Terminal
- Employee
- Sent Time
- Last Update
- Send Type
- Send Token
- Retry Count
- Actions

## Strongly recommended additional columns
- Location
- Order Mode (dine-in / takeout / delivery / pickup / bar)
- Table / Seat / Guest
- Item Count
- Current KDS Operational Stage
- Failure Reason
- Age / Time Since Sent
- Device Name
- Device Online State
- Delivered At
- Displayed At

## UX behavior
- sortable columns
- sticky filters
- badge-based status display
- color cues for stale / failed / retrying / orphaned states
- click row to open detail drawer or detail page
- copy token button
- quick filter chips

---

# DETAIL VIEW / DRAWER REQUIREMENTS

Each row should open a detail timeline view.

## Detail header
Show:
- order/ticket number
- station
- send token
- delivery status
- operational status
- source terminal
- sending employee
- device/client identity if known
- sent time
- latest update time

## Detail timeline
Include a full ordered timeline such as:
- queued
- dispatch started
- payload generated
- event published
- delivery ACK received
- display ACK received
- first interaction
- accepted / cooking / ready / served
- retry initiated
- rerouted
- recalled
- cleared / resolved / deleted
- failure events

## Detail payload section
Show a safe snapshot of:
- station target
- routing reason
- items/modifiers count
- course info
- payload checksum
- payload version
- source terminal
- source employee

## Error section
Show:
- error code
- error category
- error message
- raw diagnostic detail
- timeout info
- client-side context
- server-side context
- related events

---

# REQUIRED ACTIONS

Do not make Delete the only action.

Recommended actions:
- `View Details`
- `Retry Send`
- `Force Resend`
- `Reroute to Station`
- `Mark Resolved`
- `Clear from Active Queue`
- `Soft Delete Record`
- `Export Diagnostics`
- `Copy Send Token`

## Delete / clear guidance
These actions must be distinct:

### A. Clear from active queue
Removes it from current operations views without destroying history.

### B. Mark resolved
Marks that staff/support handled the issue.

### C. Soft delete record
Hidden from normal list views but preserved in audit.

### D. Hard delete
Avoid unless there is a very strong internal-only reason. In most production POS/KDS systems this should not be a normal feature.

Recommended default: **soft delete only**.

Always store:
- who performed the action
- when they performed it
- why they performed it
- whether a manager override was used

---

# SAFETY / DUPLICATE PROTECTION REQUIREMENTS

Retries can create duplicate kitchen tickets if done poorly.

Implement safe retry behavior:
- retry should create a new send token
- retry should preserve a reference to the original attempt
- retry should be idempotent where possible
- KDS clients should be able to dedupe active send attempts if appropriate
- the system should avoid showing duplicate actionable kitchen tickets unless intentionally resent
- operators should see whether a send is an original, retry, resend, or reroute

Add `send_type` values like:
- `initial`
- `retry`
- `manual_resend`
- `fire_course`
- `recall`
- `reroute`
- `manual_push`

---

# FILTERING REQUIREMENTS

Managers need fast troubleshooting filters.

Support filters such as:
- date range
- status
- station
- device
- terminal
- employee
- order number
- send token
- send type
- failure reason code
- active only
- failed only
- no delivery ACK
- no display ACK
- retries only
- stale older than X minutes
- deleted only
- resolved only
- order mode
- table number
- guest name

Recommended quick filters:
- `Stuck Now`
- `Failed Today`
- `No ACK`
- `No Display ACK`
- `Retries`
- `Deleted by Managers`
- `Orphaned`
- `Old Active Sends`

---

# STUCK ORDER DETECTION / HEURISTICS

This feature becomes much more valuable if the system automatically identifies suspicious states.

Implement “stuck” heuristics such as:
- `sent` older than X seconds with no delivery ACK
- `delivered` older than X seconds with no display ACK
- `displayed` but no interaction after Y minutes during active service
- excessive retry count
- order closed/paid while send unresolved
- one station succeeded while another station failed for the same ticket
- target station offline at send time
- target client version mismatch or subscription inactive

Expose a computed field like:
- `needs_attention`
- `stuck_reason`
- `stuck_since`

---

# STATION / DEVICE HEALTH VIEW

The order list alone is not enough.

Create a related operational view or card area showing station health.

For each KDS station/device show:
- station name
- device name
- online/offline
- last heartbeat
- last delivery ACK
- last display ACK
- current app version
- subscription/channel state
- pending ticket count
- failures today
- average ack latency
- average display latency

This helps determine whether the problem is with:
- the order
- the route
- the transport
- the client
- the station device

---

# AUDIT / COMPLIANCE REQUIREMENTS

Every mutation in this feature should be auditable.

Audit events should capture:
- who retried
- who rerouted
- who cleared
- who soft-deleted
- why they did it
- what changed
- previous and next state
- timestamp
- tenant/location context

Do not lose critical operational history.

---

# PERMISSION MODEL

Not everyone should be able to clear or delete KDS records.

Recommended permissions:
- `kds_order_status.view`
- `kds_order_status.view_diagnostics`
- `kds_order_status.retry`
- `kds_order_status.reroute`
- `kds_order_status.mark_resolved`
- `kds_order_status.clear_active`
- `kds_order_status.soft_delete`
- `kds_order_status.export_diagnostics`
- `kds_order_status.admin`

Recommended behavior:
- view can be available to managers/supervisors/support roles
- retry/reroute/clear/delete should require elevated permission or manager override

---

# REPORTING / KPI RECOMMENDATIONS

This feature should also create useful reliability metrics.

Recommended KPIs:
- total KDS sends
- successful delivery rate
- successful display rate
- average send → delivery latency
- average delivery → display latency
- failure rate by station
- failure rate by device
- failure rate by terminal
- retry rate
- unresolved stuck sends count
- top error codes
- sends requiring manual recovery

This will help verify whether future fixes actually improve reliability.

---

# RECOMMENDED UX STRUCTURE

Instead of one overloaded screen, consider these tabs:

## Tab 1 — Active
Recent and unresolved KDS sends

## Tab 2 — Needs Attention
Failed, stale, no ACK, no display ACK, retry-heavy, orphaned

## Tab 3 — History
Searchable audit/history of all KDS sends

## Tab 4 — Stations / Devices
Health of KDS stations and clients

## Tab 5 — Diagnostics (optional)
Advanced view for support/admins with error logs and event traces

---

# V1 SCOPE

Deliver a practical first version with strong operational value.

## V1 must include
- `kds_order_status` persistence model
- `kds_order_status_events` timeline model
- send token generation and storage
- delivery lifecycle statuses
- delivery ACK
- display ACK if possible in V1; if not, architect for it explicitly
- KDS Order Status list view
- row details drawer/page
- filters for status, station, terminal, employee, date, failure state
- retry send action
- clear/soft delete action with audit trail
- structured error codes
- station online/heartbeat indicator
- permission checks

---

# V2 RECOMMENDATIONS

After V1 is stable, add:
- stronger stuck-order heuristics
- richer device health dashboard
- export diagnostics bundle
- reroute action
- latency analytics
- notification/alerting for repeated failures
- version drift detection for KDS clients
- support bundle export by token/order/ticket

---

# API / BACKEND THINKING

Design backend services/endpoints for:
- listing KDS order status records
- filtering/searching records
- reading one status record with full timeline
- retrying a send safely
- clearing/soft-deleting a record safely
- logging delivery ACK
- logging display ACK
- logging render/client errors
- reading station/device health

Use clear tenant/location scoping everywhere.

Validate all request payloads with Zod.

Use append-only event logging for traceability.

---

# FRONTEND THINKING

Build a polished operations UI with:
- high-density but readable table/list
- status badges
- row drill-down drawer
- sticky filters
- quick search by order number or token
- fast action menu per row
- clear empty states
- clear failed-state messaging
- support-friendly copy-to-clipboard diagnostics affordances

The UI should feel like a serious operational console, not a basic report.

---

# EDGE CASES TO HANDLE

Think through and design for:
- station offline during send
- device reconnect after send
- duplicated resend attempts
- order canceled after send but before display
- recalled items
- rerouted items
- partial station success for a single order
- stale client session IDs
- app refresh causing client-side re-render ambiguity
- old payload version sent to a newer/older KDS client
- order paid/closed while unresolved KDS send remains active
- soft-deleted record later referenced by diagnostics

---

# DEFINITION OF DONE

The feature is done when:
- managers/support can view all KDS sends in a searchable UI
- every KDS send attempt has a traceable token
- the system distinguishes sent vs delivered vs displayed
- failed sends include structured reasons
- support can inspect an event timeline for any send
- managers can safely retry or clear stuck sends
- all destructive actions are soft/audited
- permissions are enforced
- station/device health is visible enough to aid diagnosis
- the feature helps determine exactly where KDS sends are failing

---

# OUTPUT FORMAT REQUIRED FROM CLAUDE

Produce the implementation plan in this order:

1. product/architecture summary
2. proposed data model
3. status lifecycle/state machine
4. send token and ACK design
5. backend/API plan
6. UI/UX plan for KDS Order Status screen
7. actions and permission model
8. failure handling and error taxonomy
9. stuck-order detection logic
10. phased implementation plan (V1 / V2)
11. risks and safeguards
12. definition of done

Where useful, provide:
- suggested schema/table names
- API route suggestions
- TypeScript type/interface suggestions
- UI component breakdown
- migration plan
- notes on idempotency and auditability

Do not give a shallow answer.
This should read like a production-ready session plan for building a robust KDS reliability feature.
