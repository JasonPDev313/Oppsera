import { getGoldenExamples } from './queries';
import type { EvalExample, ExampleCategory } from './types';

// ── Golden example lifecycle ────────────────────────────────────
// Loads active examples for LLM prompt building.
// Merges system examples (null tenantId) with tenant-specific ones.
// Ranks by quality score and rotates to avoid stale few-shot patterns.

export interface GetExamplesForPromptOptions {
  dataset?: 'core' | 'golf' | 'inventory' | 'customer' | 'mixed';
  maxExamples?: number;
  includeSystemExamples?: boolean;
  rotate?: boolean; // rotate the selection to vary few-shot examples
}

// Map dataset to example categories
const DATASET_CATEGORY_MAP: Record<string, ExampleCategory[]> = {
  core: ['sales', 'comparison', 'trend', 'anomaly'],
  golf: ['golf'],
  inventory: ['inventory'],
  customer: ['customer'],
  mixed: ['sales', 'golf', 'inventory', 'customer', 'comparison', 'trend', 'anomaly'],
};

export interface ExampleManagerInterface {
  getExamplesForPrompt(
    tenantId: string,
    options?: GetExamplesForPromptOptions,
  ): Promise<EvalExample[]>;

  getSystemExamples(category?: ExampleCategory): Promise<EvalExample[]>;
  getTenantExamples(tenantId: string, category?: ExampleCategory): Promise<EvalExample[]>;
}

// ── Default implementation ──────────────────────────────────────

class DefaultExampleManager implements ExampleManagerInterface {
  // Simple rotation counter per tenant — in-memory for Stage 1
  private rotationCounters: Map<string, number> = new Map();

  async getSystemExamples(category?: ExampleCategory): Promise<EvalExample[]> {
    return getGoldenExamples(undefined, category);
  }

  async getTenantExamples(tenantId: string, category?: ExampleCategory): Promise<EvalExample[]> {
    const all = await getGoldenExamples(tenantId, category);
    // Filter to tenant-specific only (not system-wide)
    return all.filter((e) => e.tenantId !== null);
  }

  async getExamplesForPrompt(
    tenantId: string,
    options: GetExamplesForPromptOptions = {},
  ): Promise<EvalExample[]> {
    const {
      dataset = 'core',
      maxExamples = 8,
      includeSystemExamples = true,
      rotate = true,
    } = options;

    const categories = DATASET_CATEGORY_MAP[dataset] ?? DATASET_CATEGORY_MAP['core']!;

    // Fetch examples per relevant category
    const fetchedByCategory = await Promise.all(
      categories.map((cat) => getGoldenExamples(tenantId, cat)),
    );

    // Flatten and deduplicate by ID
    const seen = new Set<string>();
    const allExamples: EvalExample[] = [];
    for (const batch of fetchedByCategory) {
      for (const ex of batch) {
        if (!seen.has(ex.id)) {
          seen.add(ex.id);
          allExamples.push(ex);
        }
      }
    }

    // Separate tenant-specific from system examples
    const tenantExamples = allExamples.filter((e) => e.tenantId !== null);
    const systemExamples = includeSystemExamples
      ? allExamples.filter((e) => e.tenantId === null)
      : [];

    // Sort by quality score desc, then take top candidates
    const sortByQuality = (a: EvalExample, b: EvalExample): number =>
      (b.qualityScore ?? 0) - (a.qualityScore ?? 0);

    tenantExamples.sort(sortByQuality);
    systemExamples.sort(sortByQuality);

    // Rotation: shift selection by counter offset to vary which examples are used
    if (rotate) {
      const counter = this.rotationCounters.get(tenantId) ?? 0;
      this.rotationCounters.set(tenantId, (counter + 1) % Math.max(1, systemExamples.length));
      // Rotate system examples pool
      if (systemExamples.length > 0) {
        const offset = counter % systemExamples.length;
        systemExamples.push(...systemExamples.splice(0, offset));
      }
    }

    // Prioritize tenant-specific examples, fill remainder with system examples
    const result: EvalExample[] = [];
    const tenantSlots = Math.min(Math.ceil(maxExamples / 2), tenantExamples.length);
    const systemSlots = maxExamples - tenantSlots;

    result.push(...tenantExamples.slice(0, tenantSlots));
    result.push(...systemExamples.slice(0, systemSlots));

    return result.slice(0, maxExamples);
  }
}

// ── Singleton ───────────────────────────────────────────────────

let _exampleManager: ExampleManagerInterface | null = null;

export function getExampleManager(): ExampleManagerInterface {
  if (!_exampleManager) {
    _exampleManager = new DefaultExampleManager();
  }
  return _exampleManager;
}

export function setExampleManager(manager: ExampleManagerInterface): void {
  _exampleManager = manager;
}
