/**
 * Phase 5A: SSE streaming endpoint for tab sync.
 *
 * Polls register_tabs every 2s for changes at a given location.
 * Sends heartbeat every 15s. Uses Vercel ReadableStream pattern.
 *
 * Auth: reads token from Authorization header or `token` query param
 * (EventSource does not support custom headers, so query param is
 * the standard approach for SSE auth).
 */

import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes (Vercel Pro)

// ── Helpers ──────────────────────────────────────────────────────────

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return req.nextUrl.searchParams.get('token');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SSE GET handler ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────

  const token = extractToken(request);
  let tenantId: string;

  if (process.env.DEV_AUTH_BYPASS === 'true') {
    // Dev mode — accept tenantId from query param
    tenantId = request.nextUrl.searchParams.get('tenantId') ?? '';
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Missing tenantId' }), { status: 400 });
    }
  } else {
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    try {
      const { getAuthAdapter } = await import('@oppsera/core/auth/get-adapter');
      const adapter = getAuthAdapter();
      const user = await adapter.validateToken(token);
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
      tenantId = user.tenantId;
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  // ── Params ──────────────────────────────────────────────────────────

  const locationId = request.nextUrl.searchParams.get('locationId');
  if (!locationId) {
    return new Response(JSON.stringify({ error: 'Missing locationId' }), { status: 400 });
  }

  // ── Stream ──────────────────────────────────────────────────────────

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream closed — swallow
        }
      };

      // Initial heartbeat
      send('heartbeat', { ts: Date.now() });

      let lastCheck = new Date(Date.now() - 5_000); // Start 5s ago to catch recent changes
      let polls = 0;

      while (!request.signal.aborted) {
        await sleep(2_000);
        if (request.signal.aborted) break;

        polls++;

        // Heartbeat every ~15s (7 polls × 2s = 14s)
        if (polls % 7 === 0) {
          send('heartbeat', { ts: Date.now() });
        }

        // Poll for changes
        try {
          const { withTenant } = await import('@oppsera/db');
          const { registerTabs } = await import('@oppsera/db');
          const { gt, and, eq } = await import('drizzle-orm');

          const tabs = await withTenant(tenantId, async (tx) => {
            return tx
              .select()
              .from(registerTabs)
              .where(
                and(
                  eq(registerTabs.locationId, locationId),
                  gt(registerTabs.updatedAt, lastCheck),
                ),
              );
          });

          for (const tab of tabs) {
            const eventType =
              tab.status === 'closed' ? 'tab_closed' : 'tab_updated';
            send(eventType, tab);

            if (tab.updatedAt && tab.updatedAt > lastCheck) {
              lastCheck = tab.updatedAt;
            }
          }
        } catch (err) {
          console.error('[tab-sync-sse] Poll error:', err);
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
