// ── What-If Simulator ──────────────────────────────────────────────
// Allows users to model scenarios like "what if I raise prices by 10%?"
// and see projected financial impact. Supports price, volume, and cost
// adjustments with configurable elasticity. Results are persisted and
// can optionally generate an LLM narrative comparing scenarios.

import { db, withTenant } from '@oppsera/db';
import { rmDailySales, semanticSimulations } from '@oppsera/db';
import { sql, eq, and, gte, lte, desc } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { getLLMAdapter } from '../llm/adapters/anthropic';
import type { NarrativeSection } from '../llm/types';

// ── Types ──────────────────────────────────────────────────────────

export type ChangeType = 'absolute' | 'percentage';

export interface ScenarioAdjustment {
  /** Variable being changed: 'price', 'volume', 'cost', or a custom slug */
  variable: string;
  /** How the change is expressed */
  changeType: ChangeType;
  /** The magnitude of the change (e.g., 10 for +10%, or 500 for +$500) */
  changeValue: number;
}

export interface ScenarioInput {
  /** Human-readable scenario name */
  name: string;
  /** List of adjustments applied in this scenario */
  adjustments: ScenarioAdjustment[];
}

export interface SimulationInput {
  /** The metric slug to simulate against (e.g., 'net_sales') */
  baseMetricSlug: string;
  /** Array of scenarios to compare */
  scenarios: ScenarioInput[];
  /** Number of trailing days to use for baseline (default: 30) */
  periodDays?: number;
  /** Optional location filter */
  locationId?: string;
  /** User who initiated the simulation */
  userId?: string;
  /** Price elasticity override (default: -0.5) */
  priceElasticity?: number;
}

export interface ComputedScenario {
  name: string;
  adjustments: ScenarioAdjustment[];
  projectedValue: number;
  deltaAbsolute: number;
  deltaPct: number;
  narrative: string | null;
}

export interface SimulationResult {
  id: string;
  baseMetricSlug: string;
  baseValue: number;
  periodDays: number;
  scenarios: ComputedScenario[];
  bestScenario: string | null;
  narrative: string | null;
  sections: NarrativeSection[];
}

// ── Constants ──────────────────────────────────────────────────────

const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_PRICE_ELASTICITY = -0.5;

// Variable type classification for computation
const REVENUE_VARIABLES = new Set(['price', 'price_change', 'pricing']);
const VOLUME_VARIABLES = new Set(['volume', 'volume_change', 'customers', 'traffic', 'orders', 'order_count']);
const COST_VARIABLES = new Set(['cost', 'cost_change', 'costs', 'expenses', 'cogs']);

// ── Metric-to-column mapping ───────────────────────────────────────

function getMetricColumn(metricSlug: string): string {
  const columnMap: Record<string, string> = {
    net_sales: 'net_sales',
    gross_sales: 'gross_sales',
    order_count: 'order_count',
    avg_order_value: 'avg_order_value',
    discount_total: 'discount_total',
    tax_total: 'tax_total',
    tender_cash: 'tender_cash',
    tender_card: 'tender_card',
    void_count: 'void_count',
    void_total: 'void_total',
  };
  return columnMap[metricSlug] ?? 'net_sales';
}

// ── Base value fetcher ─────────────────────────────────────────────

async function fetchBaseValue(
  tenantId: string,
  metricSlug: string,
  periodDays: number,
  locationId?: string,
): Promise<number> {
  const column = getMetricColumn(metricSlug);
  const isCountMetric = ['order_count', 'void_count'].includes(metricSlug);

  return withTenant(tenantId, async (tx) => {
    // Build conditions
    const conditions = [
      eq(rmDailySales.tenantId, tenantId),
      gte(rmDailySales.businessDate, sql`CURRENT_DATE - ${periodDays}::int`),
      lte(rmDailySales.businessDate, sql`CURRENT_DATE`),
    ];

    if (locationId) {
      conditions.push(eq(rmDailySales.locationId, locationId));
    }

    // For count metrics, compute daily average from SUM
    // For dollar metrics, compute daily average from SUM / days
    const result = await tx
      .select({
        totalValue: isCountMetric
          ? sql<string>`COALESCE(SUM(${sql.raw(column)}), 0)`
          : sql<string>`COALESCE(SUM(${sql.raw(column)}), 0)`,
        dayCount: sql<string>`COUNT(DISTINCT business_date)`,
      })
      .from(rmDailySales)
      .where(and(...conditions));

    const row = result[0];
    if (!row) return 0;

    const totalValue = Number(row.totalValue);
    const dayCount = Number(row.dayCount);

    if (dayCount === 0) return 0;

    // Return daily average * period days for projectable base
    // But store as daily avg for per-period projections
    return totalValue / dayCount;
  });
}

// ── Scenario computation ───────────────────────────────────────────

function computeScenarioProjection(
  baseValue: number,
  adjustments: ScenarioAdjustment[],
  priceElasticity: number,
): number {
  let projected = baseValue;

  for (const adj of adjustments) {
    const variableLower = adj.variable.toLowerCase();

    if (REVENUE_VARIABLES.has(variableLower)) {
      // Price change affects revenue through elasticity
      // Revenue = Price * Quantity
      // If price goes up X%, quantity changes by (X% * elasticity)
      // New revenue = base * (1 + priceChangePct) * (1 + elasticity * priceChangePct)
      const pricePct = adj.changeType === 'percentage'
        ? adj.changeValue / 100
        : (baseValue > 0 ? adj.changeValue / baseValue : 0);

      const volumeEffect = 1 + (priceElasticity * pricePct);
      projected = projected * (1 + pricePct) * Math.max(0, volumeEffect);

    } else if (VOLUME_VARIABLES.has(variableLower)) {
      // Volume change — direct proportional effect on revenue
      if (adj.changeType === 'percentage') {
        projected = projected * (1 + adj.changeValue / 100);
      } else {
        // Absolute volume change: assume each unit = avg revenue per unit
        // This is a simplification — we treat the absolute number as
        // proportional to current volume
        projected = projected + adj.changeValue;
      }

    } else if (COST_VARIABLES.has(variableLower)) {
      // Cost change reduces net (for net_sales scenarios, cost is subtracted)
      if (adj.changeType === 'percentage') {
        // Cost increase of X% reduces margin but not gross revenue
        // For net_sales, cost doesn't directly reduce the top-line number
        // So we pass through with a note in narrative
        // However, for a "what if costs increase $500" the user expects
        // to see profit impact, so we subtract from projected
        projected = projected * (1 - adj.changeValue / 100);
      } else {
        projected = projected - adj.changeValue;
      }

    } else {
      // Generic: treat as percentage or absolute change
      if (adj.changeType === 'percentage') {
        projected = projected * (1 + adj.changeValue / 100);
      } else {
        projected = projected + adj.changeValue;
      }
    }
  }

  return Math.round(projected * 100) / 100;
}

// ── Narrative generation ───────────────────────────────────────────

async function generateSimulationNarrative(
  baseValue: number,
  computedScenarios: ComputedScenario[],
  baseMetricSlug: string,
  periodDays: number,
): Promise<{ narrative: string; sections: NarrativeSection[] }> {
  try {
    const llm = getLLMAdapter();

    const scenarioSummaries = computedScenarios.map((s) => {
      const direction = s.deltaPct >= 0 ? 'increase' : 'decrease';
      return `- **${s.name}**: $${s.projectedValue.toLocaleString()} (${direction} of ${Math.abs(s.deltaPct).toFixed(1)}%)`;
    }).join('\n');

    const bestName = computedScenarios.reduce((best, s) =>
      s.projectedValue > (best?.projectedValue ?? 0) ? s : best,
    )?.name ?? 'None';

    const userContent = `## What-If Simulation Results

**Base metric**: ${baseMetricSlug.replace(/_/g, ' ')} (daily average)
**Base value**: $${baseValue.toLocaleString()}
**Period**: Last ${periodDays} days

### Scenarios
${scenarioSummaries}

**Best scenario**: ${bestName}

Provide a brief analysis comparing these scenarios. Focus on which option has the best risk/reward trade-off for an SMB operator. Keep it under 200 words.`;

    const response = await llm.complete(
      [{ role: 'user', content: userContent }],
      {
        systemPrompt: 'You are THE OPPS ERA LENS advisor. Analyze what-if simulation results for an SMB operator. Be concise, practical, and data-driven. Respond in markdown.',
        temperature: 0.3,
        maxTokens: 1024,
      },
    );

    const sections: NarrativeSection[] = [
      { type: 'answer', content: response.content },
    ];

    return { narrative: response.content, sections };
  } catch (err) {
    console.warn('[whatif-simulator] Narrative generation failed (non-blocking):', err);
    const fallback = `Simulation complete. Base daily ${baseMetricSlug.replace(/_/g, ' ')}: $${baseValue.toLocaleString()}. ${computedScenarios.length} scenarios computed.`;
    return {
      narrative: fallback,
      sections: [{ type: 'answer', content: fallback }],
    };
  }
}

// ── Persistence ────────────────────────────────────────────────────

async function saveSimulation(
  tenantId: string,
  result: SimulationResult,
  userId: string,
): Promise<void> {
  const scenariosForDb = result.scenarios.map((s) => ({
    name: s.name,
    adjustments: s.adjustments,
    projectedValue: s.projectedValue,
    narrative: s.narrative,
  }));

  await db.insert(semanticSimulations).values({
    id: result.id,
    tenantId,
    title: `What-if: ${result.baseMetricSlug}`,
    simulationType: 'what_if',
    baseMetricSlug: result.baseMetricSlug,
    baseValue: result.baseValue.toFixed(4),
    scenarios: scenariosForDb,
    bestScenario: result.bestScenario,
    resultNarrative: result.narrative,
    resultSections: result.sections,
    createdBy: userId,
    isSaved: false,
  });
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Runs a what-if simulation by:
 * 1. Fetching the base metric's current daily average from rm_daily_sales
 * 2. Computing projected values for each scenario using adjustments + elasticity
 * 3. Generating a narrative comparing scenarios via the LLM
 * 4. Persisting the simulation result
 */
export async function runSimulation(
  tenantId: string,
  input: SimulationInput,
): Promise<SimulationResult> {
  const {
    baseMetricSlug,
    scenarios,
    periodDays = DEFAULT_PERIOD_DAYS,
    locationId,
    userId = 'system',
    priceElasticity = DEFAULT_PRICE_ELASTICITY,
  } = input;

  // 1. Fetch base value (daily average over the trailing period)
  const baseValue = await fetchBaseValue(tenantId, baseMetricSlug, periodDays, locationId);

  // 2. Compute projections for each scenario
  const computedScenarios: ComputedScenario[] = scenarios.map((scenario) => {
    const projectedValue = computeScenarioProjection(
      baseValue,
      scenario.adjustments,
      priceElasticity,
    );

    const deltaAbsolute = projectedValue - baseValue;
    const deltaPct = baseValue !== 0 ? (deltaAbsolute / baseValue) * 100 : 0;

    return {
      name: scenario.name,
      adjustments: scenario.adjustments,
      projectedValue,
      deltaAbsolute: Math.round(deltaAbsolute * 100) / 100,
      deltaPct: Math.round(deltaPct * 100) / 100,
      narrative: null,
    };
  });

  // 3. Determine best scenario
  const bestScenario = computedScenarios.length > 0
    ? computedScenarios.reduce((best, s) =>
        s.projectedValue > best.projectedValue ? s : best,
      ).name
    : null;

  // 4. Generate comparative narrative
  const { narrative, sections } = await generateSimulationNarrative(
    baseValue,
    computedScenarios,
    baseMetricSlug,
    periodDays,
  );

  // 5. Build result
  const id = generateUlid();
  const result: SimulationResult = {
    id,
    baseMetricSlug,
    baseValue,
    periodDays,
    scenarios: computedScenarios,
    bestScenario,
    narrative,
    sections,
  };

  // 6. Persist (best-effort)
  try {
    await saveSimulation(tenantId, result, userId);
  } catch (err) {
    console.warn('[whatif-simulator] Failed to save simulation:', err);
  }

  return result;
}

// ── Intent parser ──────────────────────────────────────────────────

/**
 * Regex-based parser for common what-if patterns in natural language.
 * Returns a SimulationInput if the message matches a known pattern,
 * or null if it does not look like a what-if question.
 *
 * Supported patterns:
 * - "what if I raise prices by 10%"
 * - "what if we lose 20% of customers"
 * - "what if costs increase $500/month"
 * - "what if sales drop 15%"
 * - "what if we add 50 more orders per day"
 */
export function parseSimulationIntent(message: string): SimulationInput | null {
  const lower = message.toLowerCase().trim();

  // Must contain "what if" or "what would happen if"
  if (!lower.includes('what if') && !lower.includes('what would happen')) {
    return null;
  }

  const scenarios: ScenarioInput[] = [];

  // Pattern: price change (percentage)
  const priceMatch = lower.match(
    /(?:raise|increase|lower|decrease|drop|reduce|cut)\s+(?:the\s+)?(?:prices?|pricing)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/,
  );
  if (priceMatch) {
    const value = parseFloat(priceMatch[1]!);
    const isDecrease = /lower|decrease|drop|reduce|cut/.test(lower);
    scenarios.push({
      name: `${isDecrease ? 'Decrease' : 'Increase'} prices ${value}%`,
      adjustments: [{
        variable: 'price',
        changeType: 'percentage',
        changeValue: isDecrease ? -value : value,
      }],
    });
  }

  // Pattern: volume / customer change (percentage)
  const volumeMatch = lower.match(
    /(?:lose|gain|add|increase|decrease|drop)\s+(\d+(?:\.\d+)?)\s*%\s+(?:of\s+)?(?:customers?|traffic|volume|orders?|sales?)/,
  );
  if (volumeMatch && !priceMatch) {
    const value = parseFloat(volumeMatch[1]!);
    const isDecrease = /lose|decrease|drop/.test(lower);
    scenarios.push({
      name: `${isDecrease ? 'Lose' : 'Gain'} ${value}% volume`,
      adjustments: [{
        variable: 'volume',
        changeType: 'percentage',
        changeValue: isDecrease ? -value : value,
      }],
    });
  }

  // Pattern: cost change (absolute)
  const costAbsMatch = lower.match(
    /costs?\s+(?:increase|go up|rise|decrease|go down|drop)\s+(?:by\s+)?\$?([\d,]+(?:\.\d+)?)/,
  );
  if (costAbsMatch) {
    const value = parseFloat(costAbsMatch[1]!.replace(/,/g, ''));
    const isDecrease = /decrease|go down|drop/.test(lower);
    scenarios.push({
      name: `${isDecrease ? 'Decrease' : 'Increase'} costs $${value}`,
      adjustments: [{
        variable: 'cost',
        changeType: 'absolute',
        changeValue: isDecrease ? -value : value,
      }],
    });
  }

  // Pattern: sales drop/increase by percentage (without explicit "volume")
  const salesPctMatch = lower.match(
    /sales?\s+(?:drop|decrease|increase|grow|rise)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/,
  );
  if (salesPctMatch && !volumeMatch && !priceMatch) {
    const value = parseFloat(salesPctMatch[1]!);
    const isDecrease = /drop|decrease/.test(lower);
    scenarios.push({
      name: `Sales ${isDecrease ? 'decrease' : 'increase'} ${value}%`,
      adjustments: [{
        variable: 'volume',
        changeType: 'percentage',
        changeValue: isDecrease ? -value : value,
      }],
    });
  }

  // Pattern: absolute order count change
  const absOrderMatch = lower.match(
    /(?:add|get|lose)\s+(\d+)\s+(?:more\s+)?(?:orders?|transactions?|customers?)/,
  );
  if (absOrderMatch && !volumeMatch) {
    const value = parseInt(absOrderMatch[1]!, 10);
    const isDecrease = /lose/.test(lower);
    scenarios.push({
      name: `${isDecrease ? 'Lose' : 'Add'} ${value} orders/day`,
      adjustments: [{
        variable: 'volume',
        changeType: 'absolute',
        changeValue: isDecrease ? -value : value,
      }],
    });
  }

  if (scenarios.length === 0) {
    return null;
  }

  return {
    baseMetricSlug: 'net_sales',
    scenarios,
  };
}
