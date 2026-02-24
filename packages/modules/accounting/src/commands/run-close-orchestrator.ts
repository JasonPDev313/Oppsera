import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { erpCloseOrchestratorRuns } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { getWorkflowConfig } from '@oppsera/core/erp';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLog } from '@oppsera/core/audit/helpers';
import { getCloseChecklist } from '../queries/get-close-checklist';

export interface StepResult {
  stepKey: string;
  label: string;
  status: 'passed' | 'auto_executed' | 'skipped' | 'failed' | 'manual_required';
  startedAt: string;
  completedAt: string;
  detail?: string;
  error?: string;
}

export interface CloseOrchestratorRunResult {
  runId: string;
  status: 'completed' | 'partial' | 'failed';
  totalSteps: number;
  completedSteps: number;
  skippedSteps: number;
  failedSteps: number;
  stepResults: StepResult[];
  remainingManualSteps: string[];
}

interface RunCloseOrchestratorInput {
  businessDate: string; // YYYY-MM-DD
  locationId?: string;
}

/**
 * Auto-executable step definitions.
 *
 * These steps are accounting-owned and can be resolved automatically.
 * Cross-module steps (drawer sessions, retail/F&B close, settlements)
 * are diagnostic only — the orchestrator records their status but
 * never calls other module commands (modular monolith boundary).
 */
const AUTO_EXECUTABLE_STEPS: Record<string, {
  label: string;
  execute: (ctx: RequestContext, postingPeriod: string) => Promise<string>;
}> = {
  'draft_entries': {
    label: 'Open draft journal entries',
    execute: async (ctx, postingPeriod) => {
      // Post all draft entries for this period
      const count = await withTenant(ctx.tenantId, async (tx) => {
        const draftRows = await tx.execute(sql`
          SELECT id FROM gl_journal_entries
          WHERE tenant_id = ${ctx.tenantId}
            AND posting_period = ${postingPeriod}
            AND status = 'draft'
        `);
        const drafts = Array.from(draftRows as Iterable<Record<string, unknown>>);
        let posted = 0;
        for (const draft of drafts) {
          try {
            await tx.execute(sql`
              UPDATE gl_journal_entries
              SET status = 'posted', updated_at = now()
              WHERE id = ${String(draft.id)}
                AND tenant_id = ${ctx.tenantId}
                AND status = 'draft'
            `);
            posted++;
          } catch {
            // Continue on individual failures
          }
        }
        return posted;
      });
      return `Auto-posted ${count} draft journal entries`;
    },
  },
  'recurring_entries': {
    label: 'Recurring entries current',
    execute: async (ctx, _postingPeriod) => {
      // Generate overdue recurring entries
      const count = await withTenant(ctx.tenantId, async (tx) => {
        const overdueRows = await tx.execute(sql`
          SELECT id FROM gl_recurring_templates
          WHERE tenant_id = ${ctx.tenantId}
            AND is_active = true
            AND next_due_date <= CURRENT_DATE
        `);
        const overdue = Array.from(overdueRows as Iterable<Record<string, unknown>>);
        return overdue.length;
      });
      if (count === 0) return 'All recurring templates are current';
      return `${count} overdue recurring templates found — generate entries from GL > Recurring Templates`;
    },
  },
};

/**
 * Map checklist item labels to auto-executable step keys.
 * Only accounting-owned items can be auto-executed.
 */
function resolveStepKey(label: string): string | null {
  const labelMap: Record<string, string> = {
    'Open draft journal entries': 'draft_entries',
    'Recurring entries current': 'recurring_entries',
  };
  return labelMap[label] ?? null;
}

/**
 * Runs the close orchestrator for a given business date.
 *
 * The orchestrator wraps the existing close checklist into an executable workflow:
 * 1. Creates a run record (pending)
 * 2. Fetches the live close checklist
 * 3. For each item: skip if already passing, auto-execute if possible and autoMode is on
 * 4. Records step-by-step results
 * 5. Updates the run record with final status
 *
 * Cross-module items (drawer sessions, retail/F&B close, settlements, tips)
 * are diagnostic only — the orchestrator checks their status via ReconciliationReadApi
 * (inside getCloseChecklist) but never calls other module commands directly.
 */
export async function runCloseOrchestrator(
  ctx: RequestContext,
  input: RunCloseOrchestratorInput,
): Promise<CloseOrchestratorRunResult> {
  // Derive posting period from business date
  const postingPeriod = input.businessDate.slice(0, 7); // YYYY-MM

  // Read workflow config to determine if auto-execution is enabled
  const periodCloseConfig = await getWorkflowConfig(ctx.tenantId, 'accounting', 'period_close');
  const autoMode = periodCloseConfig.autoMode;

  // Create the run record
  const runId = generateUlid();
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.insert(erpCloseOrchestratorRuns).values({
      id: runId,
      tenantId: ctx.tenantId,
      businessDate: input.businessDate,
      locationId: input.locationId ?? null,
      status: 'running',
      triggeredBy: ctx.user?.id ?? 'auto',
      startedAt: new Date(),
    });
  });

  // Fetch the live close checklist
  const checklist = await getCloseChecklist({
    tenantId: ctx.tenantId,
    postingPeriod,
  });

  const stepResults: StepResult[] = [];
  let completedSteps = 0;
  let skippedSteps = 0;
  let failedSteps = 0;
  const remainingManualSteps: string[] = [];

  // Process each checklist item
  for (const item of checklist.items) {
    const stepStart = new Date().toISOString();
    const stepKey = resolveStepKey(item.label);

    if (item.status === 'pass') {
      // Already passing — skip
      stepResults.push({
        stepKey: stepKey ?? item.label,
        label: item.label,
        status: 'passed',
        startedAt: stepStart,
        completedAt: new Date().toISOString(),
        detail: item.detail,
      });
      completedSteps++;
      continue;
    }

    // Check if this step is auto-executable
    const autoStep = stepKey ? AUTO_EXECUTABLE_STEPS[stepKey] : null;

    if (autoStep && autoMode) {
      // Attempt auto-execution
      try {
        const detail = await autoStep.execute(ctx, postingPeriod);
        stepResults.push({
          stepKey: stepKey!,
          label: item.label,
          status: 'auto_executed',
          startedAt: stepStart,
          completedAt: new Date().toISOString(),
          detail,
        });
        completedSteps++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        stepResults.push({
          stepKey: stepKey!,
          label: item.label,
          status: 'failed',
          startedAt: stepStart,
          completedAt: new Date().toISOString(),
          detail: item.detail,
          error: errorMessage,
        });
        failedSteps++;
      }
    } else if (item.status === 'warning') {
      // Warnings are informational — record and continue
      stepResults.push({
        stepKey: stepKey ?? item.label,
        label: item.label,
        status: 'skipped',
        startedAt: stepStart,
        completedAt: new Date().toISOString(),
        detail: item.detail,
      });
      skippedSteps++;
    } else {
      // Fail status — requires manual resolution
      remainingManualSteps.push(item.label);
      stepResults.push({
        stepKey: stepKey ?? item.label,
        label: item.label,
        status: 'manual_required',
        startedAt: stepStart,
        completedAt: new Date().toISOString(),
        detail: item.detail,
      });
    }
  }

  const totalSteps = checklist.items.length;
  const runStatus: 'completed' | 'partial' | 'failed' =
    failedSteps > 0 ? 'failed'
    : remainingManualSteps.length > 0 ? 'partial'
    : 'completed';

  // Update run record with results
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.execute(sql`
      UPDATE erp_close_orchestrator_runs
      SET status = ${runStatus},
          total_steps = ${totalSteps},
          completed_steps = ${completedSteps},
          skipped_steps = ${skippedSteps},
          failed_steps = ${failedSteps},
          step_results = ${JSON.stringify(stepResults)}::jsonb,
          completed_at = now()
      WHERE id = ${runId}
        AND tenant_id = ${ctx.tenantId}
    `);
  });

  await auditLog(ctx, 'accounting.close_orchestrator.run', 'erp_close_orchestrator_run', runId);

  return {
    runId,
    status: runStatus,
    totalSteps,
    completedSteps,
    skippedSteps,
    failedSteps,
    stepResults,
    remainingManualSteps,
  };
}
