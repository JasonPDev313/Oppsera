'use client';

import { useState, useEffect } from 'react';
import { Play, CheckCircle, Plus, ArrowRight, Trophy, X } from 'lucide-react';
import { useExperiments } from '@/hooks/use-eval-training';
import type { Experiment, CreateExperimentPayload } from '@/types/eval';

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-600/30', text: 'text-slate-400', label: 'Draft' },
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Running' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Completed' },
  canceled: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Canceled' },
};

function MetricComparison({ label, controlVal, treatmentVal, format }: {
  label: string;
  controlVal: number | null;
  treatmentVal: number | null;
  format: 'rating' | 'pct' | 'ms' | 'usd';
}) {
  const fmt = (v: number | null) => {
    if (v == null) return '-';
    switch (format) {
      case 'rating': return v.toFixed(2);
      case 'pct': return `${(v * 100).toFixed(1)}%`;
      case 'ms': return `${Math.round(v)}ms`;
      case 'usd': return `$${v.toFixed(4)}`;
    }
  };
  const controlStr = fmt(controlVal);
  const treatmentStr = fmt(treatmentVal);

  return (
    <div className="flex items-center justify-between text-xs py-1.5">
      <span className="text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-mono">{controlStr}</span>
        <ArrowRight size={10} className="text-slate-600" />
        <span className="text-slate-300 font-mono">{treatmentStr}</span>
      </div>
    </div>
  );
}

function ExperimentCard({ experiment, onStart, onComplete, onRefresh: _onRefresh }: {
  experiment: Experiment;
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onRefresh: () => void;
}) {
  const status = STATUS_STYLES[experiment.status] ?? { bg: 'bg-slate-600/30', text: 'text-slate-400', label: 'Draft' };

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white truncate">{experiment.name}</h3>
            <span className={`text-xs ${status.bg} ${status.text} px-2 py-0.5 rounded ${experiment.status === 'running' ? 'animate-pulse' : ''}`}>
              {status.label}
            </span>
          </div>
          {experiment.hypothesis && (
            <p className="text-xs text-slate-400 line-clamp-2 mt-1">{experiment.hypothesis}</p>
          )}
        </div>
        {experiment.status === 'completed' && experiment.winner && experiment.winner !== 'inconclusive' && (
          <div className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-lg shrink-0">
            <Trophy size={12} />
            {experiment.winner === 'control' ? experiment.controlName : experiment.treatmentName}
          </div>
        )}
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Control</p>
          <p className="text-xs text-slate-300 font-medium">{experiment.controlName}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {experiment.controlModel ?? 'default'} &middot; t={experiment.controlTemperature ?? '0.3'}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Treatment</p>
          <p className="text-xs text-slate-300 font-medium">{experiment.treatmentName}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {experiment.treatmentModel ?? 'default'} &middot; t={experiment.treatmentTemperature ?? '0.3'}
          </p>
        </div>
      </div>

      {/* Traffic split */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-slate-500">Traffic split:</span>
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden flex">
          <div className="bg-indigo-500 h-full" style={{ width: `${100 - experiment.trafficSplitPct}%` }} />
          <div className="bg-emerald-500 h-full" style={{ width: `${experiment.trafficSplitPct}%` }} />
        </div>
        <span className="text-[10px] text-slate-500">
          {100 - experiment.trafficSplitPct}/{experiment.trafficSplitPct}
        </span>
      </div>

      {/* Turn counts */}
      <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
        <span>Control: {experiment.controlTurns} turns</span>
        <span>Treatment: {experiment.treatmentTurns} turns</span>
        {experiment.targetSampleSize && (
          <span className="text-slate-500">Target: {experiment.targetSampleSize}</span>
        )}
      </div>

      {/* Metrics comparison */}
      {(experiment.controlAvgRating != null || experiment.treatmentAvgRating != null) && (
        <div className="border-t border-slate-700 pt-3 mb-3">
          <MetricComparison label="Avg Rating" controlVal={experiment.controlAvgRating} treatmentVal={experiment.treatmentAvgRating} format="rating" />
          <MetricComparison label="Avg Quality" controlVal={experiment.controlAvgQuality} treatmentVal={experiment.treatmentAvgQuality} format="pct" />
          <MetricComparison label="Avg Latency" controlVal={experiment.controlAvgLatencyMs} treatmentVal={experiment.treatmentAvgLatencyMs} format="ms" />
          <MetricComparison label="Total Cost" controlVal={experiment.controlTotalCostUsd} treatmentVal={experiment.treatmentTotalCostUsd} format="usd" />
        </div>
      )}

      {/* Conclusion notes */}
      {experiment.conclusionNotes && (
        <p className="text-xs text-slate-400 border-t border-slate-700 pt-3 mb-3 italic">
          {experiment.conclusionNotes}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {experiment.status === 'draft' && (
          <button
            onClick={() => onStart(experiment.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Play size={11} />
            Start
          </button>
        )}
        {experiment.status === 'running' && (
          <button
            onClick={() => onComplete(experiment.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            <CheckCircle size={11} />
            Complete
          </button>
        )}
        <span className="text-[10px] text-slate-500 ml-auto">
          {new Date(experiment.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function CreateExperimentForm({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (payload: CreateExperimentPayload) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [controlName, setControlName] = useState('Control');
  const [controlModel, setControlModel] = useState('claude-3-haiku');
  const [controlTemp, setControlTemp] = useState(0.3);
  const [treatmentName, setTreatmentName] = useState('Treatment');
  const [treatmentModel, setTreatmentModel] = useState('claude-3-sonnet');
  const [treatmentTemp, setTreatmentTemp] = useState(0.3);
  const [trafficSplit, setTrafficSplit] = useState(50);
  const [targetSample, setTargetSample] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        hypothesis: hypothesis.trim() || undefined,
        controlName,
        controlModel,
        controlTemperature: controlTemp,
        treatmentName,
        treatmentModel,
        treatmentTemperature: treatmentTemp,
        trafficSplitPct: trafficSplit,
        targetSampleSize: targetSample || undefined,
      });
      onClose();
    } catch {
      // error handled by hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-indigo-500/30 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">New Experiment</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Experiment Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sonnet vs Haiku for sales queries"
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you testing?"
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Hypothesis</label>
          <textarea
            rows={2}
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g. Sonnet will produce higher quality narratives at acceptable latency"
            className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Control */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Control</p>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Name</label>
              <input
                type="text"
                value={controlName}
                onChange={(e) => setControlName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Model</label>
              <select
                value={controlModel}
                onChange={(e) => setControlModel(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="claude-3-haiku">Claude 3 Haiku</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Temperature: {controlTemp.toFixed(1)}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={controlTemp}
                onChange={(e) => setControlTemp(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>

          {/* Treatment */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-3">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Treatment</p>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Name</label>
              <input
                type="text"
                value={treatmentName}
                onChange={(e) => setTreatmentName(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Model</label>
              <select
                value={treatmentModel}
                onChange={(e) => setTreatmentModel(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="claude-3-haiku">Claude 3 Haiku</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Temperature: {treatmentTemp.toFixed(1)}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={treatmentTemp}
                onChange={(e) => setTreatmentTemp(parseFloat(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Traffic Split: {100 - trafficSplit}% Control / {trafficSplit}% Treatment
            </label>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={trafficSplit}
              onChange={(e) => setTrafficSplit(parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Target Sample Size</label>
            <input
              type="number"
              min={10}
              value={targetSample}
              onChange={(e) => setTargetSample(parseInt(e.target.value) || 0)}
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            {isSubmitting ? 'Creating...' : 'Create Experiment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExperimentsPage() {
  const { data, isLoading, error, load, create, start, complete } = useExperiments();

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (payload: CreateExperimentPayload) => {
    await create(payload);
    load();
  };

  const handleStart = async (id: string) => {
    try {
      await start(id);
      load();
    } catch {
      // error handled by hook
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await complete(id);
      load();
    } catch {
      // error handled by hook
    }
  };

  const experiments = data?.experiments ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">A/B Experiments</h1>
          <p className="text-sm text-slate-400 mt-0.5">Compare prompt and model configurations side by side</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={12} />
          New Experiment
        </button>
      </div>

      {showCreate && (
        <CreateExperimentForm
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

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
        <div>
          {experiments.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              No experiments yet. Create your first A/B experiment to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {experiments.map((exp) => (
                <ExperimentCard
                  key={exp.id}
                  experiment={exp}
                  onStart={handleStart}
                  onComplete={handleComplete}
                  onRefresh={() => load()}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
