'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';

// ── Types ─────────────────────────────────────────────────────────

export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SimulationVariable {
  /** The metric or dimension to adjust */
  slug: string;
  label: string;
  /** Current baseline value */
  baselineValue: number;
  /** The adjusted value for the simulation */
  simulatedValue: number;
  /** Unit for display (e.g., "%", "$", "units") */
  unit: string;
}

export interface SimulationOutcome {
  metricSlug: string;
  label: string;
  baselineValue: number;
  projectedValue: number;
  changePct: number;
  formattedBaseline: string;
  formattedProjected: string;
  /** Confidence interval for the projection */
  confidenceLow: number;
  confidenceHigh: number;
  /** Confidence level (0-1) */
  confidence: number;
}

export interface SimulationScenario {
  name: string;
  variables: SimulationVariable[];
}

export interface Simulation {
  id: string;
  title: string;
  description: string | null;
  status: SimulationStatus;
  /** The input variables that were adjusted */
  variables: SimulationVariable[];
  /** Projected outcomes based on the simulation */
  outcomes: SimulationOutcome[];
  /** AI-generated narrative explaining the simulation results */
  narrative: string | null;
  /** Alternative scenarios the AI generated for comparison */
  alternativeScenarios: SimulationScenario[] | null;
  /** The lens context used for this simulation */
  lensSlug: string | null;
  /** Time period the simulation covers */
  periodStart: string;
  periodEnd: string;
  /** Whether this simulation was saved for future reference */
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Error message if the simulation failed */
  errorMessage: string | null;
}

export interface RunSimulationInput {
  title: string;
  description?: string;
  variables: Array<{
    slug: string;
    simulatedValue: number;
  }>;
  /** Metrics to project outcomes for (defaults to all related metrics) */
  outcomeMetrics?: string[];
  lensSlug?: string;
  periodStart: string;
  periodEnd: string;
  /** Whether to generate alternative scenarios */
  includeAlternatives?: boolean;
}

export interface SaveSimulationInput {
  title?: string;
  description?: string;
}

// ── useSimulations ────────────────────────────────────────────────

interface UseSimulationsOptions {
  savedOnly?: boolean;
  limit?: number;
  lensSlug?: string;
}

export function useSimulations(opts: UseSimulationsOptions = {}) {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSimulations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({
        savedOnly: opts.savedOnly,
        limit: opts.limit,
        lensSlug: opts.lensSlug,
      });
      const res = await apiFetch<{ data: Simulation[] }>(
        `/api/v1/semantic/simulations${qs}`,
      );
      setSimulations(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load simulations');
    } finally {
      setIsLoading(false);
    }
  }, [opts.savedOnly, opts.limit, opts.lensSlug]);

  useEffect(() => {
    fetchSimulations();
  }, [fetchSimulations]);

  const runSimulation = useCallback(async (input: RunSimulationInput): Promise<Simulation | null> => {
    try {
      const res = await apiFetch<{ data: Simulation }>(
        '/api/v1/semantic/simulations',
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      const simulation = res.data;

      // If the simulation is still running, poll until completion
      if (simulation.status === 'pending' || simulation.status === 'running') {
        const completed = await pollSimulationStatus(simulation.id);
        if (completed) {
          await fetchSimulations();
          return completed;
        }
      }

      await fetchSimulations();
      return simulation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run simulation');
      return null;
    }
  }, [fetchSimulations]);

  const saveSimulation = useCallback(async (
    simulationId: string,
    input: SaveSimulationInput = {},
  ): Promise<Simulation | null> => {
    try {
      const res = await apiFetch<{ data: Simulation }>(
        `/api/v1/semantic/simulations/${simulationId}/save`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      );
      await fetchSimulations();
      return res.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save simulation');
      return null;
    }
  }, [fetchSimulations]);

  const deleteSimulation = useCallback(async (simulationId: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/semantic/simulations/${simulationId}`, {
        method: 'DELETE',
      });
      await fetchSimulations();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete simulation');
      return false;
    }
  }, [fetchSimulations]);

  return {
    simulations,
    isLoading,
    error,
    runSimulation,
    saveSimulation,
    deleteSimulation,
    refresh: fetchSimulations,
  };
}

// ── useSimulationDetail ───────────────────────────────────────────

export function useSimulationDetail(id: string) {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) {
      setSimulation(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: Simulation }>(
        `/api/v1/semantic/simulations/${id}`,
      );
      setSimulation(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load simulation');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { simulation, isLoading, error, refresh: fetchDetail };
}

// ── Polling helper for async simulation completion ────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // 60 seconds max polling

async function pollSimulationStatus(simulationId: string): Promise<Simulation | null> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      const res = await apiFetch<{ data: Simulation }>(
        `/api/v1/semantic/simulations/${simulationId}`,
      );
      const sim = res.data;

      if (sim.status === 'completed' || sim.status === 'failed') {
        return sim;
      }
    } catch {
      // Continue polling on transient errors
    }
  }

  return null;
}
