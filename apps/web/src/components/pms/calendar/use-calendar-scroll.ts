'use client';

import { useRef, useEffect, useCallback } from 'react';

interface UseCalendarScrollOptions {
  onNavigatePrev?: () => void;
  onNavigateNext?: () => void;
  edgeZone?: number;
  baseSpeed?: number;
  navigationHoldMs?: number;
  enabled?: boolean;
}

const STICKY_OFFSET = 144;
const NAVIGATION_COOLDOWN_MS = 1200;
const MAX_INDICATOR_OPACITY = 0.6;
const INDICATOR_OPACITY_SCALE = 0.8;

function setIndicatorOpacity(
  el: HTMLDivElement | null,
  opacity: number,
): void {
  if (el) el.style.opacity = String(opacity);
}

export function useCalendarScroll({
  onNavigatePrev,
  onNavigateNext,
  edgeZone = 60,
  baseSpeed = 4,
  navigationHoldMs = 800,
  enabled = true,
}: UseCalendarScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftIndicatorRef = useRef<HTMLDivElement>(null);
  const rightIndicatorRef = useRef<HTMLDivElement>(null);

  const onPrevRef = useRef(onNavigatePrev);
  const onNextRef = useRef(onNavigateNext);
  onPrevRef.current = onNavigatePrev;
  onNextRef.current = onNavigateNext;

  const baseSpeedRef = useRef(baseSpeed);
  const navigationHoldMsRef = useRef(navigationHoldMs);
  baseSpeedRef.current = baseSpeed;
  navigationHoldMsRef.current = navigationHoldMs;

  const state = useRef({
    direction: 0 as -1 | 0 | 1,
    intensity: 0,
    rafId: 0,
    boundaryTimer: 0,
    boundaryDirection: 0 as -1 | 0 | 1,
    cooldownUntil: 0,
    isPanning: false,
    panStartX: 0,
    panScrollLeft: 0,
  });

  const tick = useCallback(() => {
    const s = state.current;
    const el = containerRef.current;
    if (!el || s.direction === 0) return;

    const speed = baseSpeedRef.current * (0.5 + s.intensity * 1.5);
    el.scrollLeft += s.direction * speed;

    const atLeftEdge = el.scrollLeft <= 0;
    const atRightEdge = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    const atBoundary =
      (s.direction === -1 && atLeftEdge) ||
      (s.direction === 1 && atRightEdge);

    if (atBoundary && Date.now() > s.cooldownUntil) {
      if (s.boundaryDirection !== s.direction) {
        s.boundaryDirection = s.direction;
        s.boundaryTimer = Date.now();
      } else if (Date.now() - s.boundaryTimer >= navigationHoldMsRef.current) {
        if (s.direction === -1) onPrevRef.current?.();
        else onNextRef.current?.();
        s.cooldownUntil = Date.now() + NAVIGATION_COOLDOWN_MS;
        s.boundaryDirection = 0;
        s.boundaryTimer = 0;
      }
    } else if (!atBoundary) {
      s.boundaryDirection = 0;
      s.boundaryTimer = 0;
    }

    s.rafId = requestAnimationFrame(tick);
  }, []);

  const startScroll = useCallback(
    (dir: -1 | 1, intensity: number) => {
      const s = state.current;
      s.direction = dir;
      s.intensity = intensity;
      if (!s.rafId) s.rafId = requestAnimationFrame(tick);
    },
    [tick],
  );

  const stopScroll = useCallback(() => {
    const s = state.current;
    if (s.rafId) {
      cancelAnimationFrame(s.rafId);
      s.rafId = 0;
    }
    s.direction = 0;
    s.intensity = 0;
    s.boundaryDirection = 0;
    s.boundaryTimer = 0;
    setIndicatorOpacity(leftIndicatorRef.current, 0);
    setIndicatorOpacity(rightIndicatorRef.current, 0);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const showLeftIndicator = (intensity: number) => {
      const opacity = Math.min(intensity * INDICATOR_OPACITY_SCALE, MAX_INDICATOR_OPACITY);
      setIndicatorOpacity(leftIndicatorRef.current, opacity);
      setIndicatorOpacity(rightIndicatorRef.current, 0);
    };

    const onMouseMove = (e: MouseEvent) => {
      const s = state.current;
      if (s.isPanning) return;

      const rect = el.getBoundingClientRect();
      const xInContainer = e.clientX - rect.left;
      const distFromLeft = xInContainer - STICKY_OFFSET;
      const distFromRight = rect.width - xInContainer;

      if (xInContainer < edgeZone) {
        // Far-left edge zone (over/near the sticky room column)
        const intensity = 1 - xInContainer / edgeZone;
        startScroll(-1, intensity);
        showLeftIndicator(intensity);
      } else if (distFromLeft >= 0 && distFromLeft < edgeZone) {
        // Just after sticky column zone
        const intensity = 1 - distFromLeft / edgeZone;
        startScroll(-1, intensity);
        showLeftIndicator(intensity);
      } else if (distFromRight >= 0 && distFromRight < edgeZone) {
        // Right edge zone
        const intensity = 1 - distFromRight / edgeZone;
        startScroll(1, intensity);
        const opacity = Math.min(intensity * INDICATOR_OPACITY_SCALE, MAX_INDICATOR_OPACITY);
        setIndicatorOpacity(rightIndicatorRef.current, opacity);
        setIndicatorOpacity(leftIndicatorRef.current, 0);
      } else {
        stopScroll();
      }
    };

    const onMouseLeave = () => {
      stopScroll();
    };

    const onMouseDown = (e: MouseEvent) => {
      const isMiddle = e.button === 1;
      const isShiftLeft = e.shiftKey && e.button === 0;
      if (!isMiddle && !isShiftLeft) return;

      e.preventDefault();
      const s = state.current;
      s.isPanning = true;
      s.panStartX = e.clientX;
      s.panScrollLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
      stopScroll();
    };

    const onPanMove = (e: MouseEvent) => {
      const s = state.current;
      if (!s.isPanning) return;
      const dx = e.clientX - s.panStartX;
      el.scrollLeft = s.panScrollLeft - dx;
    };

    const onPanEnd = () => {
      const s = state.current;
      if (!s.isPanning) return;
      s.isPanning = false;
      el.style.cursor = '';
    };

    el.addEventListener('mousemove', onMouseMove, { passive: true });
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('mousedown', onMouseDown, { passive: false });
    window.addEventListener('mousemove', onPanMove, { passive: true });
    window.addEventListener('mouseup', onPanEnd);

    return () => {
      stopScroll();
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onPanMove);
      window.removeEventListener('mouseup', onPanEnd);
    };
  }, [enabled, edgeZone, startScroll, stopScroll]);

  return { containerRef, leftIndicatorRef, rightIndicatorRef };
}
