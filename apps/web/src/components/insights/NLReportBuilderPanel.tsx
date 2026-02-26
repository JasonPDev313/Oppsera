'use client';

import { useState, useCallback } from 'react';
import { FileText, Loader2, Save, Lightbulb } from 'lucide-react';
import { DataQualityBadge } from './DataQualityBadge';

// ── Types ──────────────────────────────────────────────────────────

export interface DraftReportDef {
  name: string;
  dimensions: string[];
  measures: string[];
  filters: { field: string; operator: string; value: string }[];
  chartType: string;
}

export interface NLReportResult {
  reportDefinition: DraftReportDef;
  explanation: string;
  confidence: number;
}

interface NLReportBuilderPanelProps {
  onBuild: (description: string) => void;
  result?: NLReportResult;
  isLoading?: boolean;
  onSave: (report: DraftReportDef) => void;
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
  'Weekly sales by category',
  'Top 10 items this month',
  'Daily revenue trend for the last 30 days',
  'Inventory value by location',
  'Customer spending by membership tier',
];

const CHART_TYPE_OPTIONS = [
  { value: 'line', label: 'Line Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'table', label: 'Table' },
  { value: 'metric_card', label: 'Metric Card' },
];

function confidenceToGrade(confidence: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (confidence >= 0.9) return 'A';
  if (confidence >= 0.75) return 'B';
  if (confidence >= 0.6) return 'C';
  if (confidence >= 0.4) return 'D';
  return 'F';
}

// ── Component ──────────────────────────────────────────────────────

export function NLReportBuilderPanel({
  onBuild,
  result,
  isLoading,
  onSave,
  className,
}: NLReportBuilderPanelProps) {
  const [description, setDescription] = useState('');
  const [showExamples, setShowExamples] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editedDef, setEditedDef] = useState<DraftReportDef | null>(null);

  const handleBuild = useCallback(() => {
    if (description.trim()) {
      onBuild(description.trim());
    }
  }, [onBuild, description]);

  const handleExampleClick = useCallback((prompt: string) => {
    setDescription(prompt);
    onBuild(prompt);
    setShowExamples(false);
  }, [onBuild]);

  const handleSave = useCallback(() => {
    const def = editedDef ?? result?.reportDefinition;
    if (def) {
      onSave(def);
    }
  }, [onSave, editedDef, result]);

  // When result arrives, initialize edit state
  const currentDef = editedDef ?? result?.reportDefinition;

  return (
    <div className={`rounded-lg border border-border bg-surface ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Natural Language Report Builder</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Text input */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Describe the report you want...
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleBuild();
              }
            }}
            placeholder="e.g., Show me weekly sales by category for the last quarter"
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
          />
        </div>

        {/* Example prompts */}
        {showExamples && (
          <div>
            <button
              type="button"
              onClick={() => setShowExamples(false)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-1.5"
            >
              <Lightbulb className="h-3 w-3" />
              Example reports
            </button>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleExampleClick(prompt)}
                  className="px-2.5 py-1 text-xs rounded-full border border-border text-foreground hover:border-primary/50 hover:bg-accent/50 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Build button */}
        <button
          type="button"
          onClick={handleBuild}
          disabled={isLoading || !description.trim()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {isLoading ? 'Building...' : 'Build Report'}
        </button>

        {/* Results */}
        {result && !isLoading && currentDef && (
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Confidence + explanation */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {result.explanation}
                </p>
              </div>
              <DataQualityBadge
                grade={confidenceToGrade(result.confidence)}
                score={Math.round(result.confidence * 100)}
                compact
              />
            </div>

            {/* Interpreted definition */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Report Definition</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditMode((p) => !p);
                    if (!editedDef) setEditedDef({ ...currentDef });
                  }}
                  className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  {editMode ? 'Done Editing' : 'Edit'}
                </button>
              </div>

              {/* Name */}
              <FieldRow label="Name" editing={editMode}>
                {editMode ? (
                  <input
                    type="text"
                    value={editedDef?.name ?? currentDef.name}
                    onChange={(e) =>
                      setEditedDef((prev) => ({
                        ...(prev ?? currentDef),
                        name: e.target.value,
                      }))
                    }
                    className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  />
                ) : (
                  <span className="text-xs text-foreground">{currentDef.name}</span>
                )}
              </FieldRow>

              {/* Chart type */}
              <FieldRow label="Chart Type" editing={editMode}>
                {editMode ? (
                  <select
                    value={editedDef?.chartType ?? currentDef.chartType}
                    onChange={(e) =>
                      setEditedDef((prev) => ({
                        ...(prev ?? currentDef),
                        chartType: e.target.value,
                      }))
                    }
                    className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                  >
                    {CHART_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-foreground capitalize">{currentDef.chartType}</span>
                )}
              </FieldRow>

              {/* Dimensions */}
              <FieldRow label="Dimensions" editing={false}>
                <div className="flex flex-wrap gap-1">
                  {currentDef.dimensions.map((dim) => (
                    <span
                      key={dim}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-500"
                    >
                      {dim}
                    </span>
                  ))}
                  {currentDef.dimensions.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">None</span>
                  )}
                </div>
              </FieldRow>

              {/* Measures */}
              <FieldRow label="Measures" editing={false}>
                <div className="flex flex-wrap gap-1">
                  {currentDef.measures.map((m) => (
                    <span
                      key={m}
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-500"
                    >
                      {m}
                    </span>
                  ))}
                  {currentDef.measures.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">None</span>
                  )}
                </div>
              </FieldRow>

              {/* Filters */}
              {currentDef.filters.length > 0 && (
                <FieldRow label="Filters" editing={false}>
                  <div className="space-y-0.5">
                    {currentDef.filters.map((f, idx) => (
                      <span
                        key={idx}
                        className="block text-[10px] text-muted-foreground"
                      >
                        {f.field} {f.operator} {f.value}
                      </span>
                    ))}
                  </div>
                </FieldRow>
              )}
            </div>

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Save className="h-4 w-4" />
              Save as Custom Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Field Row ──────────────────────────────────────────────────────

function FieldRow({
  label,
  editing: _editing,
  children,
}: {
  label: string;
  editing: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[10px] text-muted-foreground font-medium w-16 shrink-0 pt-0.5 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
