'use client';

import { useEffect, useRef } from 'react';

interface AlertableTicket {
  ticketId: string;
  elapsedSeconds: number;
  items: Array<{ itemStatus: string }>;
}

/**
 * Page-level KDS audio alert hook.
 *
 * Replaces per-card AudioContext creation with a single shared context.
 * Deduplicates alerts: each ticket fires at most one warning and one critical tone.
 * Rate-limits: max one tone per alert type per 2 seconds to prevent storms
 * when many tickets cross a threshold on the same poll cycle.
 * Plays a "done" chime when a ticket's items all become ready.
 */
export function useKdsAudioAlerts({
  tickets,
  warningThresholdSeconds,
  criticalThresholdSeconds,
  enabled = true,
}: {
  tickets: AlertableTicket[];
  warningThresholdSeconds: number;
  criticalThresholdSeconds: number;
  enabled?: boolean;
}) {
  // Track which tickets have already fired each alert type
  const firedWarningRef = useRef(new Set<string>());
  const firedCriticalRef = useRef(new Set<string>());
  const firedDoneRef = useRef(new Set<string>());

  // Rate-limit: last tone time per type
  const lastToneRef = useRef({ warning: 0, critical: 0, done: 0 });

  // Shared AudioContext — created lazily on first tone, reused thereafter
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  // Prune stale ticket IDs from tracking sets when tickets leave the view
  useEffect(() => {
    const currentIds = new Set(tickets.map((t) => t.ticketId));
    for (const id of firedWarningRef.current) {
      if (!currentIds.has(id)) firedWarningRef.current.delete(id);
    }
    for (const id of firedCriticalRef.current) {
      if (!currentIds.has(id)) firedCriticalRef.current.delete(id);
    }
    for (const id of firedDoneRef.current) {
      if (!currentIds.has(id)) firedDoneRef.current.delete(id);
    }
  }, [tickets]);

  useEffect(() => {
    if (!enabled || tickets.length === 0) return;

    const now = Date.now();
    const RATE_LIMIT_MS = 2000;

    let needsWarning = false;
    let needsCritical = false;
    let needsDone = false;

    for (const ticket of tickets) {
      const { ticketId, elapsedSeconds, items } = ticket;
      const allReady = items.length > 0 && items.every(
        (i) => i.itemStatus === 'ready' || i.itemStatus === 'voided',
      );

      // Warning threshold crossing
      if (
        elapsedSeconds >= warningThresholdSeconds &&
        elapsedSeconds < criticalThresholdSeconds &&
        !firedWarningRef.current.has(ticketId)
      ) {
        firedWarningRef.current.add(ticketId);
        needsWarning = true;
      }

      // Critical threshold crossing
      if (
        elapsedSeconds >= criticalThresholdSeconds &&
        !firedCriticalRef.current.has(ticketId)
      ) {
        firedCriticalRef.current.add(ticketId);
        needsCritical = true;
      }

      // All-items-ready chime
      if (allReady && !firedDoneRef.current.has(ticketId)) {
        firedDoneRef.current.add(ticketId);
        needsDone = true;
      }
    }

    // Play at most one tone per type, rate-limited
    if (needsCritical && now - lastToneRef.current.critical >= RATE_LIMIT_MS) {
      lastToneRef.current.critical = now;
      playTone(audioCtxRef, 1200, 400);
    } else if (needsWarning && now - lastToneRef.current.warning >= RATE_LIMIT_MS) {
      lastToneRef.current.warning = now;
      playTone(audioCtxRef, 880, 200);
    }

    if (needsDone && now - lastToneRef.current.done >= RATE_LIMIT_MS) {
      lastToneRef.current.done = now;
      // Double-beep done chime
      playTone(audioCtxRef, 660, 120);
      setTimeout(() => playTone(audioCtxRef, 880, 150), 150);
    }
  }, [tickets, warningThresholdSeconds, criticalThresholdSeconds, enabled]);
}

function getOrCreateAudioCtx(
  ref: React.RefObject<AudioContext | null>,
): AudioContext | null {
  try {
    if (!ref.current || ref.current.state === 'closed') {
      ref.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    }
    return ref.current;
  } catch {
    return null;
  }
}

function playTone(
  ctxRef: React.RefObject<AudioContext | null>,
  frequency: number,
  duration: number,
) {
  const ctx = getOrCreateAudioCtx(ctxRef);
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration / 1000);
  } catch { /* audio not available */ }
}
