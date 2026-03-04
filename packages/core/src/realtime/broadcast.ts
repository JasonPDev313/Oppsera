export type FnbBroadcastEvent =
  | 'tables'
  | 'waitlist'
  | 'reservations'
  | 'kds'
  | 'tabs'
  | 'guest_pay';

/**
 * Broadcast a notification to all Supabase Realtime subscribers
 * on the F&B channel for a given tenant/location.
 *
 * Uses the Supabase Realtime HTTP API — a single POST request.
 * No WebSocket, no channel subscribe/unsubscribe lifecycle.
 * Perfect for Vercel serverless (stateless, no persistent connections).
 *
 * Sends a single batched message with all affected topics.
 * Notification-only — no entity data in the payload.
 * Clients refetch authoritative data from authenticated API endpoints.
 *
 * Best-effort — never throws. Correctness comes from polling fallback.
 * Realtime is a latency optimization, not a correctness mechanism.
 *
 * MUST be called AFTER the DB transaction commits (outside publishWithOutbox).
 * Call sites should use .catch(() => {}).
 */
export async function broadcastFnb(
  ctx: { tenantId: string; locationId?: string },
  ...events: FnbBroadcastEvent[]
): Promise<void> {
  if (!ctx.locationId || events.length === 0) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  const channelName = `oppsera:fnb:${ctx.tenantId}:${ctx.locationId}`;
  const ts = Date.now();

  try {
    // 3-second timeout — best-effort, don't hold the Vercel function on stalled connections.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    // Single HTTP POST with one batched message containing all affected topics.
    // Clients debounce-coalesce incoming notifications to prevent refetch storms.
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: channelName,
            event: 'fnb_changed',
            payload: { topics: events, ts },
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // Limit error body read to prevent hanging on large responses
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[realtime] broadcast HTTP ${res.status}:`, body);
    }
  } catch (err) {
    // Never throw — business operations must always succeed.
    // Polling fallback catches missed broadcasts within 10-60s.
    console.error('[realtime] broadcast failed:', err);
  }
}
