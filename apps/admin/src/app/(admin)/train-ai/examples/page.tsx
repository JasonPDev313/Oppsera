'use client';

import { useEffect, useState, useRef } from 'react';
import { BookOpen, Trash2, Tag, Plus, Upload, Download, Edit2, X, BarChart2 } from 'lucide-react';
import { useEvalExamples } from '@/hooks/use-eval';
import { useExampleCrud } from '@/hooks/use-eval-training';
import type { EvalExample, ExampleEffectiveness } from '@/types/eval';

const CATEGORY_OPTIONS = [
  '', 'sales', 'inventory', 'customer', 'golf', 'comparison', 'trend', 'anomaly',
];

const DIFFICULTY_OPTIONS = ['', 'easy', 'medium', 'hard'];

function EffectivenessIndicator({ effectiveness }: { effectiveness: ExampleEffectiveness | null }) {
  if (!effectiveness) return null;
  const statusColor =
    effectiveness.verificationStatus === 'verified' ? 'text-emerald-400 bg-emerald-500/20' :
    effectiveness.verificationStatus === 'degraded' ? 'text-red-400 bg-red-500/20' :
    'text-slate-400 bg-slate-700';

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColor}`}>
        {effectiveness.verificationStatus}
      </span>
      <span className="text-xs text-slate-500">
        Used {effectiveness.usageCount}× · Avg quality: {effectiveness.avgQualityWhenUsed?.toFixed(2) ?? '—'}
      </span>
    </div>
  );
}

function ExampleRow({
  example,
  onDelete,
  onEdit,
  onViewEffectiveness,
  effectiveness,
}: {
  example: EvalExample;
  onDelete: () => void;
  onEdit: () => void;
  onViewEffectiveness: () => void;
  effectiveness: ExampleEffectiveness | null;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white line-clamp-2">{example.userMessage}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onViewEffectiveness}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="View effectiveness"
          >
            <BarChart2 size={12} />
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => {
              if (confirming) {
                onDelete();
              } else {
                setConfirming(true);
                setTimeout(() => setConfirming(false), 3000);
              }
            }}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
              confirming
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Trash2 size={12} />
            {confirming ? 'Confirm?' : ''}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        {example.category && (
          <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded flex items-center gap-1">
            <BookOpen size={10} />
            {example.category}
          </span>
        )}
        {example.difficulty && (
          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded capitalize">
            {example.difficulty}
          </span>
        )}
        {example.tags?.map((tag) => (
          <span key={tag} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded flex items-center gap-1">
            <Tag size={9} />
            {tag}
          </span>
        ))}
        <span className="text-xs text-slate-500 ml-auto">
          Used {example.usageCount}×
        </span>
      </div>

      <EffectivenessIndicator effectiveness={effectiveness} />

      <p className="text-xs text-slate-600 mt-2">{new Date(example.createdAt).toLocaleDateString()}</p>
    </div>
  );
}

function CreateExampleForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { createExample, isSubmitting } = useExampleCrud();
  const [question, setQuestion] = useState('');
  const [planJson, setPlanJson] = useState('');
  const [category, setCategory] = useState('sales');
  const [difficulty, setDifficulty] = useState('medium');
  const [formError, setFormError] = useState('');

  const handleSubmit = async () => {
    if (!question.trim()) { setFormError('Question is required'); return; }
    if (!planJson.trim()) { setFormError('Plan JSON is required'); return; }

    let plan: Record<string, unknown>;
    try {
      plan = JSON.parse(planJson);
    } catch {
      setFormError('Invalid JSON in plan field');
      return;
    }

    try {
      await createExample({ question, plan, category, difficulty });
      onCreated();
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create example');
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-indigo-500/50 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Create Golden Example</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={16} /></button>
      </div>

      {formError && (
        <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">{formError}</div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Question</label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="What are my top selling items this week?"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Plan (JSON)</label>
          <textarea
            value={planJson}
            onChange={(e) => setPlanJson(e.target.value)}
            rows={5}
            className="bg-slate-900 border border-slate-600 text-white text-xs font-mono rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder='{"metrics": ["total_sales"], "dimensions": ["item_name"], "dateRange": {"type": "last_7d"}}'
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {CATEGORY_OPTIONS.filter(Boolean).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Difficulty</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DIFFICULTY_OPTIONS.filter(Boolean).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-4 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Creating…' : 'Create Example'}
        </button>
      </div>
    </div>
  );
}

export default function EvalExamplesPage() {
  const { data: examples, isLoading, error, load, remove } = useEvalExamples();
  const { exportExamples, bulkImport, getEffectiveness, isSubmitting } = useExampleCrud();
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [effectivenessMap, setEffectivenessMap] = useState<Record<string, ExampleEffectiveness>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (category) params.category = category;
    if (difficulty) params.difficulty = difficulty;
    load(params);
  }, [load, category, difficulty]);

  const handleExport = async () => {
    try {
      const data = await exportExamples({ category, difficulty });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `golden-examples-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleImport = async () => {
    setImportError('');
    setImportSuccess('');

    let parsed: unknown[];
    try {
      parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error('Must be a JSON array');
    } catch {
      setImportError('Invalid JSON — must be an array of examples');
      return;
    }

    try {
      const result = await bulkImport({
        examples: (parsed as Record<string, unknown>[]).map((ex) => ({
          question: String(ex.question ?? ''),
          plan: (ex.plan ?? ex.expectedPlan ?? {}) as Record<string, unknown>,
          category: String(ex.category ?? 'sales'),
          difficulty: String(ex.difficulty ?? 'medium'),
        })),
      });
      setImportSuccess(`Imported ${result.imported} examples`);
      setImportJson('');
      setShowImport(false);
      load();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportJson(ev.target?.result as string);
      setShowImport(true);
    };
    reader.readAsText(file);
  };

  const handleViewEffectiveness = async (id: string) => {
    try {
      const eff = await getEffectiveness(id);
      setEffectivenessMap((prev) => ({ ...prev, [id]: eff }));
    } catch {
      // silently fail
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Golden Examples</h1>
          <p className="text-sm text-slate-400 mt-0.5">Few-shot examples injected into LLM prompts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Download size={12} />
            Export
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs bg-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Upload size={12} />
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileImport} className="hidden" />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={12} />
            Create
          </button>
          <span className="text-xs text-slate-400 ml-2">
            <BookOpen size={13} className="inline mr-1" />
            {examples.length} examples
          </span>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateExampleForm onClose={() => setShowCreate(false)} onCreated={() => load()} />
      )}

      {/* Import form */}
      {showImport && (
        <div className="bg-slate-800 rounded-xl p-6 border border-amber-500/50 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Bulk Import</h2>
            <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-white"><X size={16} /></button>
          </div>
          {importError && (
            <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">{importError}</div>
          )}
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            rows={8}
            className="bg-slate-900 border border-slate-600 text-white text-xs font-mono rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-3"
            placeholder='[{"question": "...", "plan": {...}, "category": "sales", "difficulty": "easy"}]'
          />
          <button
            onClick={handleImport}
            disabled={isSubmitting}
            className="px-4 py-2 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Importing…' : 'Import Examples'}
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="mb-4 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
          {importSuccess}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All categories</option>
          {CATEGORY_OPTIONS.filter(Boolean).map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>

        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All difficulties</option>
          {DIFFICULTY_OPTIONS.filter(Boolean).map((d) => (
            <option key={d} value={d} className="capitalize">{d}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {examples.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <BookOpen size={32} className="mx-auto mb-3 opacity-50" />
              <p>No examples yet.</p>
              <p className="text-xs mt-1">Create from scratch, import a JSON file, or promote turns from the eval feed.</p>
            </div>
          ) : (
            examples.map((ex) => (
              <ExampleRow
                key={ex.id}
                example={ex}
                onDelete={() => remove(ex.id)}
                onEdit={() => {/* TODO: inline edit */}}
                onViewEffectiveness={() => handleViewEffectiveness(ex.id)}
                effectiveness={effectivenessMap[ex.id] ?? null}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
