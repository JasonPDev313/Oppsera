'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Sparkles, Settings2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { useTags } from '@/hooks/use-tags';
import { useSmartTagRuleMutations } from '@/hooks/use-smart-tag-rules';
import type { SmartTagRuleDetail } from '@/hooks/use-smart-tag-rules';
import { ConditionGroupEditor } from './ConditionGroupEditor';
import type { ConditionGroup } from './ConditionGroupEditor';

interface SmartTagRuleBuilderProps {
  open: boolean;
  onClose: () => void;
  editRule?: SmartTagRuleDetail | null;
  onSaved: () => void;
}

type EvaluationMode = 'scheduled' | 'event_driven' | 'hybrid';

interface FormState {
  tagId: string;
  name: string;
  description: string;
  conditionGroups: ConditionGroup[];
  evaluationMode: EvaluationMode;
  scheduleCron: string;
  autoRemove: boolean;
  cooldownHours: string;
  priority: string;
}

function defaultFormState(): FormState {
  return {
    tagId: '',
    name: '',
    description: '',
    conditionGroups: [{ conditions: [{ metric: '', operator: 'gt', value: '' }] }],
    evaluationMode: 'scheduled',
    scheduleCron: '0 2 * * *',
    autoRemove: true,
    cooldownHours: '',
    priority: '0',
  };
}

function formStateFromRule(rule: SmartTagRuleDetail): FormState {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  const groups: ConditionGroup[] = conditions.length > 0
    ? (conditions as ConditionGroup[])
    : [{ conditions: [{ metric: '', operator: 'gt', value: '' }] }];

  return {
    tagId: rule.tagId,
    name: rule.name,
    description: rule.description ?? '',
    conditionGroups: groups,
    evaluationMode: (rule.evaluationMode as EvaluationMode) || 'scheduled',
    scheduleCron: rule.scheduleCron ?? '0 2 * * *',
    autoRemove: rule.autoRemove,
    cooldownHours: rule.cooldownHours != null ? String(rule.cooldownHours) : '',
    priority: String(rule.priority),
  };
}

const STEPS = ['Tag & Info', 'Conditions', 'Schedule & Review'] as const;

export function SmartTagRuleBuilder({ open, onClose, editRule, onSaved }: SmartTagRuleBuilderProps) {
  const { toast } = useToast();
  const { data: smartTags } = useTags({ tagType: 'smart' });
  const { createRule, updateRule, isSubmitting } = useSmartTagRuleMutations();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEdit = !!editRule;

  // Reset form when dialog opens or editRule changes
  useEffect(() => {
    if (open) {
      setStep(0);
      setErrors({});
      if (editRule) {
        setForm(formStateFromRule(editRule));
      } else {
        setForm(defaultFormState());
      }
    }
  }, [open, editRule]);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (s === 0) {
      if (!form.tagId) newErrors.tagId = 'Please select a tag';
      if (!form.name.trim()) newErrors.name = 'Name is required';
    }

    if (s === 1) {
      const hasAnyMetric = form.conditionGroups.some((g) =>
        g.conditions.some((c) => c.metric),
      );
      if (!hasAnyMetric) {
        newErrors.conditions = 'At least one condition with a selected metric is required';
      }
    }

    if (s === 2) {
      if (
        (form.evaluationMode === 'scheduled' || form.evaluationMode === 'hybrid') &&
        !form.scheduleCron.trim()
      ) {
        newErrors.scheduleCron = 'Cron schedule is required for scheduled evaluation';
      }
      if (form.cooldownHours) {
        const val = parseInt(form.cooldownHours, 10);
        if (Number.isNaN(val) || val < 0) {
          newErrors.cooldownHours = 'Cooldown must be a non-negative number';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSave = async () => {
    if (!validateStep(step)) return;

    const payload = {
      tagId: form.tagId,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      evaluationMode: form.evaluationMode,
      scheduleCron:
        form.evaluationMode === 'scheduled' || form.evaluationMode === 'hybrid'
          ? form.scheduleCron.trim()
          : undefined,
      conditions: form.conditionGroups,
      autoRemove: form.autoRemove,
      cooldownHours: form.cooldownHours ? parseInt(form.cooldownHours, 10) : undefined,
      priority: parseInt(form.priority, 10) || 0,
    };

    try {
      if (isEdit && editRule) {
        await updateRule(editRule.id, payload);
        toast.success('Rule updated successfully');
      } else {
        await createRule(payload);
        toast.success('Rule created successfully');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save rule');
    }
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative flex w-full max-w-2xl flex-col rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">
              {isEdit ? 'Edit Smart Tag Rule' : 'Create Smart Tag Rule'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1 px-6 pt-4">
          {STEPS.map((label, idx) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full transition-colors ${
                idx <= step ? 'bg-indigo-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ maxHeight: '60vh' }}>
          {step === 0 && (
            <StepTagInfo
              form={form}
              errors={errors}
              smartTags={smartTags}
              isEdit={isEdit}
              onUpdate={updateField}
            />
          )}
          {step === 1 && (
            <StepConditions
              groups={form.conditionGroups}
              error={errors.conditions}
              onChange={(groups) => updateField('conditionGroups', groups)}
            />
          )}
          {step === 2 && (
            <StepSchedule
              form={form}
              errors={errors}
              onUpdate={updateField}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0 || isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 ${
                isSubmitting ? 'cursor-not-allowed opacity-50' : ''
              }`}
            >
              {isSubmitting ? 'Saving...' : isEdit ? 'Update Rule' : 'Save Rule'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Step 1: Tag Selection + Basic Info                                  */
/* ------------------------------------------------------------------ */

interface StepTagInfoProps {
  form: FormState;
  errors: Record<string, string>;
  smartTags: { id: string; name: string; color: string }[];
  isEdit: boolean;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function StepTagInfo({ form, errors, smartTags, isEdit, onUpdate }: StepTagInfoProps) {
  return (
    <div className="space-y-5">
      {/* Tag selector */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-foreground">
          Smart Tag <span className="text-red-500">*</span>
        </label>
        <select
          value={form.tagId}
          onChange={(e) => onUpdate('tagId', e.target.value)}
          disabled={isEdit}
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-60"
        >
          <option value="">Select a smart tag...</option>
          {smartTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        {errors.tagId && <p className="text-xs text-red-500">{errors.tagId}</p>}
        {isEdit && (
          <p className="text-xs text-muted-foreground">Tag cannot be changed after creation</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-foreground">
          Rule Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onUpdate('name', e.target.value)}
          placeholder="e.g. High-value frequent visitor"
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-foreground">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => onUpdate('description', e.target.value)}
          rows={3}
          placeholder="Optional description of what this rule does..."
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2: Conditions                                                  */
/* ------------------------------------------------------------------ */

interface StepConditionsProps {
  groups: ConditionGroup[];
  error?: string;
  onChange: (groups: ConditionGroup[]) => void;
}

function StepConditions({ groups, error, onChange }: StepConditionsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-foreground">Conditions</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Conditions within a group are combined with AND. Groups are combined with OR.
        </p>
      </div>

      <ConditionGroupEditor groups={groups} onChange={onChange} />

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3: Schedule & Review                                           */
/* ------------------------------------------------------------------ */

interface StepScheduleProps {
  form: FormState;
  errors: Record<string, string>;
  onUpdate: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function StepSchedule({ form, errors, onUpdate }: StepScheduleProps) {
  const showCron = form.evaluationMode === 'scheduled' || form.evaluationMode === 'hybrid';

  return (
    <div className="space-y-5">
      {/* Evaluation mode */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground">Evaluation Mode</label>
        <div className="space-y-2">
          {([
            { value: 'scheduled', label: 'Scheduled', desc: 'Run on a cron schedule' },
            { value: 'event_driven', label: 'Event Driven', desc: 'Run when customer data changes' },
            { value: 'hybrid', label: 'Hybrid', desc: 'Both scheduled and event-driven' },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                form.evaluationMode === opt.value
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : 'border-border hover:bg-accent/50'
              }`}
            >
              <input
                type="radio"
                name="evaluationMode"
                value={opt.value}
                checked={form.evaluationMode === opt.value}
                onChange={(e) => onUpdate('evaluationMode', e.target.value as EvaluationMode)}
                className="mt-0.5 h-4 w-4 border-input text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Cron schedule */}
      {showCron && (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-foreground">
            Cron Schedule <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={form.scheduleCron}
              onChange={(e) => onUpdate('scheduleCron', e.target.value)}
              placeholder="0 2 * * *"
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm font-mono text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          {errors.scheduleCron && <p className="text-xs text-red-500">{errors.scheduleCron}</p>}
          <p className="text-xs text-muted-foreground">
            Standard cron expression (e.g., &quot;0 2 * * *&quot; = daily at 2 AM)
          </p>
        </div>
      )}

      {/* Auto-remove toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <span className="text-sm font-medium text-foreground">Auto-Remove</span>
          <p className="text-xs text-muted-foreground">
            Automatically remove tag when customer no longer matches conditions
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={form.autoRemove}
          onClick={() => onUpdate('autoRemove', !form.autoRemove)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
            form.autoRemove ? 'bg-indigo-600' : 'bg-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
              form.autoRemove ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Cooldown hours */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-foreground">Cooldown Hours</label>
        <input
          type="number"
          value={form.cooldownHours}
          onChange={(e) => onUpdate('cooldownHours', e.target.value)}
          placeholder="Optional"
          min="0"
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        {errors.cooldownHours && <p className="text-xs text-red-500">{errors.cooldownHours}</p>}
        <p className="text-xs text-muted-foreground">
          Minimum hours between re-evaluations for the same customer
        </p>
      </div>

      {/* Priority */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-foreground">Priority</label>
        <input
          type="number"
          value={form.priority}
          onChange={(e) => onUpdate('priority', e.target.value)}
          min="0"
          className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        <p className="text-xs text-muted-foreground">
          Higher priority rules are evaluated first (0 = lowest)
        </p>
      </div>
    </div>
  );
}
