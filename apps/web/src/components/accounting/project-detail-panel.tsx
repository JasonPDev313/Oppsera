'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MoreVertical } from 'lucide-react';
import { useProject, useProjectMutations } from '@/hooks/use-project-costing';
import { useDialogA11y } from '@/lib/dialog-a11y';

interface ProjectDetailPanelProps {
  projectId: string;
  onClose: () => void;
}

export function ProjectDetailPanel({ projectId, onClose }: ProjectDetailPanelProps) {
  const { data: project, isLoading } = useProject(projectId);
  const { closeProject, archiveProject, unarchiveProject } = useProjectMutations();
  const [showActions, setShowActions] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, true, { onClose, labelledBy: 'project-detail-title' });

  const panel = (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div ref={panelRef} className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-border bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="project-detail-title" className="text-lg font-semibold text-foreground">Project Detail</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActions(!showActions)}
                className="rounded-md p-1.5 hover:bg-accent transition-colors"
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </button>
              {showActions && project && (
                <div className="absolute right-0 top-full mt-1 w-40 rounded-md border border-border bg-surface py-1 shadow-lg z-50">
                  {project.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => { closeProject.mutate(project.id); setShowActions(false); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    >
                      Close Project
                    </button>
                  )}
                  {project.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={() => { archiveProject.mutate({ id: project.id }); setShowActions(false); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    >
                      Archive
                    </button>
                  )}
                  {project.status === 'archived' && (
                    <button
                      type="button"
                      onClick={() => { unarchiveProject.mutate(project.id); setShowActions(false); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
                    >
                      Unarchive
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-accent transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-6 p-6">
          {isLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-48 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-32 w-full rounded bg-muted" />
            </div>
          ) : !project ? (
            <p className="text-sm text-muted-foreground">Project not found.</p>
          ) : (
            <>
              {/* Project info */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Project Number</p>
                  <p className="font-mono text-sm text-foreground">{project.projectNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm font-medium text-foreground">{project.name}</p>
                </div>
                {project.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm text-foreground">{project.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusBadge status={project.status} />
                  </div>
                  {project.projectType && (
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="text-sm capitalize text-foreground">{project.projectType.replace(/_/g, ' ')}</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {project.startDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Start Date</p>
                      <p className="text-sm text-foreground">{project.startDate}</p>
                    </div>
                  )}
                  {project.endDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">End Date</p>
                      <p className="text-sm text-foreground">{project.endDate}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Budget & Cost summary */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <h3 className="text-sm font-medium text-foreground">Cost Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Budget</p>
                    <p className="font-medium tabular-nums text-foreground">
                      {project.budgetAmount != null ? formatMoney(project.budgetAmount) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Cost</p>
                    <p className="font-medium tabular-nums text-foreground">
                      {formatMoney(project.costSummary.totalDirectCost + project.costSummary.totalLaborCost + project.costSummary.totalMaterialCost + project.costSummary.totalOtherCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Revenue</p>
                    <p className="font-medium tabular-nums text-foreground">{formatMoney(project.costSummary.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Gross Margin</p>
                    <p className={`font-medium tabular-nums ${project.costSummary.totalGrossMargin >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatMoney(project.costSummary.totalGrossMargin)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tasks list */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground">Tasks ({project.tasks.length})</h3>
                {project.tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tasks.</p>
                ) : (
                  <div className="space-y-1">
                    {project.tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div>
                          <p className="text-sm text-foreground">{task.name}</p>
                          <p className="text-xs text-muted-foreground">{task.taskNumber}</p>
                        </div>
                        <div className="text-right">
                          <StatusBadge status={task.status} />
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {formatMoney(task.actualCost)}
                            {task.budgetAmount != null && ` / ${formatMoney(task.budgetAmount)}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {project.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-line">{project.notes}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(panel, document.body);
}

// ── Helpers ──────────────────────────────────────────────────

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500 border-green-500/30',
    open: 'bg-green-500/10 text-green-500 border-green-500/30',
    in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
    completed: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
    complete: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30',
    closed: 'bg-gray-500/10 text-muted-foreground border-gray-500/30',
    archived: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.active}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
