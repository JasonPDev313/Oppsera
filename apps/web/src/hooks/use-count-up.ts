'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Animates a number from 0 to `target` over `durationMs` using requestAnimationFrame.
 * Returns the current animated value.
 */
export function useCountUp(target: number, durationMs = 500, enabled = true): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || target === 0) {
      setValue(target);
      return;
    }

    setValue(0);
    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs, enabled]);

  return value;
}
