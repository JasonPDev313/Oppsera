'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { SimulationInput, SimulationResult } from '@/components/insights/WhatIfPanel';

// ── Simulation API response shape ───────────────────────────────

interface SimulationScenarioResponse {
  name: string;
  adjustments: Array<{
    variable: string;
    changeType: 'absolute' | 'percentage';
    changeValue: number;
  }>;
  projectedValue: number | null;
  narrative: string | null;
}

interface SimulationApiResponse {
  data: {
    id: string;
    baseValue: number;
    scenarios: SimulationScenarioResponse[];
  };
}

// ── Hook ───────────────────────────────────────────────────────────

export function useWhatIf() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simulate = useCallback(async (input: SimulationInput): Promise<SimulationResult | null> => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiFetch<SimulationApiResponse>('/api/v1/semantic/simulations', {
        method: 'POST',
        body: JSON.stringify({
          title: `What-If: ${input.baseMetric}`,
          simulationType: 'what_if',
          baseMetricSlug: input.baseMetric,
          scenarios: input.scenarios.map((s) => ({
            name: s.label,
            adjustments: [{
              variable: s.adjustmentType,
              changeType: 'percentage' as const,
              changeValue: s.changePct,
            }],
          })),
          isSaved: false,
        }),
      });

      const baseValue = res.data.baseValue;

      const mapped: SimulationResult = {
        baseValue,
        scenarios: res.data.scenarios.map((s) => {
          const projected = s.projectedValue ?? 0;
          const deltaAbsolute = projected - baseValue;
          const deltaPct = baseValue !== 0
            ? (deltaAbsolute / baseValue) * 100
            : 0;
          return {
            label: s.name,
            projectedValue: projected,
            deltaAbsolute,
            deltaPct,
          };
        }),
      };

      setResult(mapped);
      return mapped;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Simulation failed';
      setError(msg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, simulate, clear, isLoading, error };
}
