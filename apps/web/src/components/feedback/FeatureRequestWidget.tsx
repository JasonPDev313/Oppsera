'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Lightbulb,
  X,
  Send,
  CheckCircle2,
  ChevronRight,
  Bug,
  Sparkles,
  Zap,
  ArrowLeft,
  Loader2,
  Clock,
  MessageSquarePlus,
  AlertCircle,
  ThumbsUp,
  Paperclip,
  Image,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { navigation } from '@/lib/navigation';

// ── Types ────────────────────────────────────────────────────────

type RequestType = 'feature' | 'enhancement' | 'bug';
type Priority = 'critical' | 'high' | 'medium' | 'low';
type Step = 'type' | 'details' | 'impact' | 'review';
type WidgetState = 'collapsed' | 'open' | 'submitting' | 'success';

interface FeatureRequestFormData {
  requestType: RequestType | null;
  module: string;
  submodule: string;
  title: string;
  description: string;
  businessImpact: string;
  priority: Priority;
  additionalNotes: string;
  currentWorkaround: string;
}

interface RecentRequest {
  id: string;
  title: string;
  requestType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  voteCount: number;
}

interface SimilarRequest {
  id: string;
  title: string;
  requestType: string;
  status: string;
  voteCount: number;
}

interface Attachment {
  file: File;
  dataUrl: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────

const DRAFT_KEY = 'oppsera_feature_request_draft';
const LAST_SEEN_KEY = 'oppsera_fr_last_seen';
const DRAFT_SAVE_DEBOUNCE_MS = 500;
const MAX_ATTACHMENT_SIZE = 512 * 1024; // 512KB
const MAX_ATTACHMENTS = 3;
const VALID_REQUEST_TYPES: RequestType[] = ['feature', 'enhancement', 'bug'];
const VALID_PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low'];

const REQUEST_TYPES = [
  {
    value: 'feature' as const,
    label: 'New Feature',
    description: 'Something that doesn\'t exist yet',
    icon: Sparkles,
    color: 'text-indigo-400 bg-indigo-500/20',
  },
  {
    value: 'enhancement' as const,
    label: 'Enhancement',
    description: 'Improve something that already works',
    icon: Zap,
    color: 'text-amber-400 bg-amber-500/20',
  },
  {
    value: 'bug' as const,
    label: 'Bug Report',
    description: 'Something isn\'t working correctly',
    icon: Bug,
    color: 'text-red-400 bg-red-500/20',
  },
] as const;

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'bg-red-500/20 text-red-400 ring-red-500/30' },
  { value: 'high', label: 'High', color: 'bg-amber-500/20 text-amber-400 ring-amber-500/30' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500/20 text-blue-400 ring-blue-500/30' },
  { value: 'low', label: 'Low', color: 'bg-emerald-500/20 text-emerald-400 ring-emerald-500/30' },
];

const STEPS: { key: Step; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'details', label: 'Details' },
  { key: 'impact', label: 'Impact' },
  { key: 'review', label: 'Review' },
];

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  submitted: { label: 'Submitted', classes: 'bg-blue-500/20 text-blue-400' },
  under_review: { label: 'Under Review', classes: 'bg-amber-500/20 text-amber-400' },
  planned: { label: 'Planned', classes: 'bg-indigo-500/20 text-indigo-400' },
  in_progress: { label: 'In Progress', classes: 'bg-purple-500/20 text-purple-400' },
  completed: { label: 'Completed', classes: 'bg-green-500/20 text-green-400' },
  declined: { label: 'Declined', classes: 'bg-red-500/20 text-red-400' },
};

const INITIAL_FORM: FeatureRequestFormData = {
  requestType: null,
  module: '',
  submodule: '',
  title: '',
  description: '',
  businessImpact: '',
  priority: 'medium',
  additionalNotes: '',
  currentWorkaround: '',
};

// ── Module/submodule derivation from navigation ──────────────────

function deriveModules(): { label: string; value: string; children: { label: string; value: string }[] }[] {
  return navigation
    .filter((n) => n.name !== 'Settings' && n.name !== 'Dashboard')
    .map((item) => ({
      label: item.name,
      value: item.name,
      children: (item.children ?? []).map((child) => ({
        label: child.name,
        value: child.name,
      })),
    }));
}

// ── Draft persistence ────────────────────────────────────────────

/** Validate and sanitize a draft loaded from localStorage. */
function validateDraft(raw: unknown): FeatureRequestFormData {
  if (typeof raw !== 'object' || raw === null) return { ...INITIAL_FORM };
  const obj = raw as Record<string, unknown>;

  return {
    requestType:
      typeof obj.requestType === 'string' && VALID_REQUEST_TYPES.includes(obj.requestType as RequestType)
        ? (obj.requestType as RequestType)
        : null,
    module: typeof obj.module === 'string' ? obj.module.slice(0, 100) : '',
    submodule: typeof obj.submodule === 'string' ? obj.submodule.slice(0, 100) : '',
    title: typeof obj.title === 'string' ? obj.title.slice(0, 200) : '',
    description: typeof obj.description === 'string' ? obj.description.slice(0, 2000) : '',
    businessImpact: typeof obj.businessImpact === 'string' ? obj.businessImpact.slice(0, 1000) : '',
    priority:
      typeof obj.priority === 'string' && VALID_PRIORITIES.includes(obj.priority as Priority)
        ? (obj.priority as Priority)
        : 'medium',
    additionalNotes: typeof obj.additionalNotes === 'string' ? obj.additionalNotes.slice(0, 1000) : '',
    currentWorkaround: typeof obj.currentWorkaround === 'string' ? obj.currentWorkaround.slice(0, 500) : '',
  };
}

function loadDraft(): FeatureRequestFormData {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return validateDraft(JSON.parse(raw));
  } catch { /* ignore corrupt localStorage */ }
  return { ...INITIAL_FORM };
}

function saveDraft(data: FeatureRequestFormData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch { /* ignore */ }
}

// ── Main Widget ──────────────────────────────────────────────────

export function FeatureRequestWidget() {
  const [widgetState, setWidgetState] = useState<WidgetState>('collapsed');
  const [step, setStep] = useState<Step>('type');
  const [form, setForm] = useState<FeatureRequestFormData>(() => loadDraft());
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false); // double-click guard
  const [hasStatusUpdate, setHasStatusUpdate] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);
  const [similarRequests, setSimilarRequests] = useState<SimilarRequest[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const modules = useMemo(deriveModules, []);

  // Refs for cleanup
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // ── Notification dot: check for status changes on collapsed widget ──
  const notificationFetchedRef = useRef(false);
  useEffect(() => {
    if (widgetState !== 'collapsed') {
      notificationFetchedRef.current = false;
      return;
    }
    if (notificationFetchedRef.current) return;
    notificationFetchedRef.current = true;

    const controller = new AbortController();
    const timerId = setTimeout(() => {
      apiFetch<{ data: RecentRequest[]; meta: unknown }>('/api/v1/feature-requests?limit=5', { signal: controller.signal })
        .then((res) => {
          if (!mountedRef.current) return;
          let lastSeen = 0;
          try {
            const stored = localStorage.getItem(LAST_SEEN_KEY);
            if (stored) lastSeen = Number(stored);
          } catch { /* ignore */ }
          const hasUpdate = res.data.some(
            (r) => r.status !== 'submitted' && new Date(r.updatedAt).getTime() > lastSeen
          );
          setHasStatusUpdate(hasUpdate);
        })
        .catch(() => { /* non-fatal */ });
    }, 500);
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [widgetState]);

  // Load recent requests lazily — deferred so it never blocks step rendering.
  // Uses a separate ref to only fetch once per open cycle.
  const fetchedRecentRef = useRef(false);
  useEffect(() => {
    if (widgetState !== 'open' || step !== 'type') {
      // Reset fetch flag when widget closes so re-opening fetches again
      if (widgetState === 'collapsed') fetchedRecentRef.current = false;
      return;
    }
    if (fetchedRecentRef.current) return;
    fetchedRecentRef.current = true;

    const controller = new AbortController();
    // Defer the fetch off the critical render path
    const timerId = setTimeout(() => {
      apiFetch<{ data: RecentRequest[]; meta: unknown }>('/api/v1/feature-requests?limit=3', { signal: controller.signal })
        .then((res) => {
          if (mountedRef.current) setRecentRequests(res.data);
        })
        .catch(() => { /* non-fatal, aborted, or network error */ });
    }, 300);
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [widgetState, step]);

  // ── Similar request detection on review step ──
  useEffect(() => {
    if (widgetState !== 'open' || step !== 'review') {
      setSimilarRequests([]);
      return;
    }
    if (!form.title.trim() || !form.module) return;

    setLoadingSimilar(true);
    const controller = new AbortController();
    const params = new URLSearchParams({ module: form.module, title: form.title.trim() });
    apiFetch<{ data: SimilarRequest[] }>(`/api/v1/feature-requests/similar?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (mountedRef.current) setSimilarRequests(res.data);
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => {
        if (mountedRef.current) setLoadingSimilar(false);
      });
    return () => controller.abort();
  }, [widgetState, step, form.title, form.module]);

  // Debounced auto-save draft
  useEffect(() => {
    if (widgetState !== 'open') return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => saveDraft(form), DRAFT_SAVE_DEBOUNCE_MS);
  }, [form, widgetState]);

  const updateForm = useCallback(<K extends keyof FeatureRequestFormData>(field: K, value: FeatureRequestFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Reset submodule when module changes
      if (field === 'module') next.submodule = '';
      return next;
    });
    // Clear error when user edits
    setError(null);
  }, []);

  // ── Vote handler (optimistic) ──
  const handleVote = useCallback(async (requestId: string) => {
    // Optimistic toggle
    const wasVoted = votedIds.has(requestId);
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
    setRecentRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, voteCount: r.voteCount + (wasVoted ? -1 : 1) }
          : r
      )
    );

    try {
      await apiFetch(`/api/v1/feature-requests/${requestId}/vote`, { method: 'POST' });
    } catch {
      // Revert on error
      if (!mountedRef.current) return;
      setVotedIds((prev) => {
        const next = new Set(prev);
        if (wasVoted) next.add(requestId);
        else next.delete(requestId);
        return next;
      });
      setRecentRequests((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, voteCount: r.voteCount + (wasVoted ? 1 : -1) }
            : r
        )
      );
    }
  }, [votedIds]);

  // ── Attachment handlers ──
  const handleAddAttachment = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setAttachmentWarning(null);

    const file = files[0]!;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachmentWarning(`File "${file.name}" exceeds 512KB limit.`);
      e.target.value = '';
      return;
    }
    if (attachments.length >= MAX_ATTACHMENTS) {
      setAttachmentWarning(`Maximum ${MAX_ATTACHMENTS} screenshots allowed.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (!mountedRef.current) return;
      setAttachments((prev) => [
        ...prev,
        { file, dataUrl: reader.result as string, name: file.name },
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [attachments.length]);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentWarning(null);
  }, []);

  const selectedModule = modules.find((m) => m.value === form.module);
  const submodules = selectedModule?.children ?? [];

  // ── Step validation (derived, no callback overhead) ─────────
  const canAdvance = useMemo((): boolean => {
    switch (step) {
      case 'type':
        return form.requestType !== null;
      case 'details':
        return form.module !== '' && form.title.trim().length >= 3 && form.description.trim().length >= 10;
      case 'impact':
      case 'review':
        return true;
      default:
        return false;
    }
  }, [step, form.requestType, form.module, form.title, form.description]);

  const nextStep = useCallback(() => {
    if (!canAdvance) return;
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx >= 0 && idx < STEPS.length - 1) setStep(STEPS[idx + 1]!.key);
  }, [step, canAdvance]);

  const prevStep = useCallback(() => {
    const idx = STEPS.findIndex((s) => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1]!.key);
  }, [step]);

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!form.requestType || submitting) return;
    setSubmitting(true);
    setWidgetState('submitting');
    setError(null);

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await apiFetch<{ data: { id: string } }>('/api/v1/feature-requests', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          requestType: form.requestType,
          module: form.module,
          submodule: form.submodule || undefined,
          title: form.title.trim(),
          description: form.description.trim(),
          businessImpact: form.businessImpact.trim() || undefined,
          priority: form.priority,
          additionalNotes: form.additionalNotes.trim() || undefined,
          currentWorkaround: form.currentWorkaround.trim() || undefined,
        }),
      });
      if (!mountedRef.current) return;

      // Upload attachments (non-fatal)
      if (attachments.length > 0 && result.data?.id) {
        const uploadResults = await Promise.allSettled(
          attachments.map((att) =>
            apiFetch(`/api/v1/feature-requests/${result.data.id}/attachments`, {
              method: 'POST',
              body: JSON.stringify({
                fileName: att.name,
                mimeType: att.file.type,
                dataUrl: att.dataUrl,
              }),
            })
          )
        );
        if (!mountedRef.current) return;
        const failCount = uploadResults.filter((r) => r.status === 'rejected').length;
        if (failCount > 0) {
          setAttachmentWarning(`${failCount} screenshot(s) failed to upload.`);
        }
      }

      clearDraft();
      setAttachments([]);
      setWidgetState('success');
      // Auto-close after 3 seconds
      successTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setWidgetState('collapsed');
        setForm({ ...INITIAL_FORM });
        setStep('type');
        setAttachments([]);
        setAttachmentWarning(null);
      }, 3000);
    } catch (err) {
      if (!mountedRef.current) return;
      // Parse server error message if available
      let message = 'Failed to submit. Please try again.';
      if (err instanceof Error && 'statusCode' in err) {
        const code = (err as { statusCode: number }).statusCode;
        if (code === 429) message = 'You\'ve reached the daily submission limit. Please try again tomorrow.';
        else if (code === 409) message = 'A similar request was just submitted. Please wait a moment.';
        else if (code >= 500) message = 'Server error — please try again in a moment.';
      }
      setError(message);
      setWidgetState('open');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  }, [form, submitting, attachments]);

  // ── Close & reset ────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setWidgetState('collapsed');
    setError(null);
  }, []);

  const handleOpen = useCallback(() => {
    setWidgetState('open');
    setError(null);
    setHasStatusUpdate(false);
    // Update last-seen timestamp
    try {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
    } catch { /* ignore */ }
    // If there's a saved draft with a type, go to the right step
    const draft = loadDraft();
    if (draft.requestType) {
      if (draft.title && draft.module) {
        setStep('impact');
      } else {
        setStep('details');
      }
    } else {
      setStep('type');
    }
    setForm(draft);
  }, []);

  // ── Keyboard handlers ────────────────────────────────────────
  useEffect(() => {
    if (widgetState !== 'open') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      // Ctrl/Cmd+Enter to advance or submit (doesn't fire in textareas without modifier)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canAdvance) {
        e.preventDefault();
        if (step === 'review') handleSubmit();
        else nextStep();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [widgetState, handleClose, canAdvance, step, nextStep, handleSubmit]);

  // ── Collapsed card ───────────────────────────────────────────
  if (widgetState === 'collapsed') {
    return (
      <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
        <button
          type="button"
          onClick={handleOpen}
          className="flex w-full items-center gap-3 rounded-xl px-6 py-4 text-left transition-colors hover:bg-accent"
        >
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
            <MessageSquarePlus className="h-5 w-5 text-indigo-400" aria-hidden="true" />
            {hasStatusUpdate && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-indigo-500" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Share Your Ideas</p>
            <p className="text-xs text-muted-foreground">Request features, suggest improvements, or report bugs</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // ── Success state ────────────────────────────────────────────
  if (widgetState === 'success') {
    return (
      <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
        <div className="flex flex-col items-center justify-center px-6 py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-7 w-7 text-green-400" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-semibold text-green-400">Thank you!</p>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Your {form.requestType === 'bug' ? 'bug report' : 'request'} has been submitted successfully.
            We review all submissions and will follow up.
          </p>
        </div>
      </div>
    );
  }

  // ── Submitting state ─────────────────────────────────────────
  if (widgetState === 'submitting') {
    return (
      <div className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5">
        <div className="flex flex-col items-center justify-center px-6 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground" role="status">Submitting your request...</p>
        </div>
      </div>
    );
  }

  // ── Open state — multi-step form ─────────────────────────────
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div
      className="rounded-xl bg-surface shadow-sm ring-1 ring-gray-950/5"
      role="region"
      aria-label="Feature request form"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-indigo-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">
            {form.requestType
              ? REQUEST_TYPES.find((t) => t.value === form.requestType)?.label ?? 'Request'
              : 'Share Your Idea'}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress indicator */}
      <div className="flex gap-1 px-5 pt-3" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-indigo-500' : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="px-5 pt-1 text-xs text-muted-foreground">
        Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex]?.label}
      </p>

      {/* Step content */}
      <div className="px-5 py-4">
        {step === 'type' && (
          <StepType
            selected={form.requestType}
            onSelect={(type) => {
              updateForm('requestType', type);
              setStep('details');
            }}
          />
        )}

        {step === 'details' && (
          <StepDetails
            form={form}
            modules={modules}
            submodules={submodules}
            onChange={updateForm}
            attachments={attachments}
            attachmentWarning={attachmentWarning}
            onAddAttachment={handleAddAttachment}
            onRemoveAttachment={handleRemoveAttachment}
          />
        )}

        {step === 'impact' && (
          <StepImpact
            form={form}
            onChange={updateForm}
          />
        )}

        {step === 'review' && (
          <StepReview
            form={form}
            attachmentCount={attachments.length}
            similarRequests={similarRequests}
            loadingSimilar={loadingSimilar}
            onVoteSimilar={handleVote}
            votedIds={votedIds}
          />
        )}

        {/* Error display with aria-live for screen readers */}
        {error && (
          <div className="mt-2 flex items-start gap-1.5" role="alert" aria-live="assertive">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-xs text-red-500">{error}</p>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <button
          type="button"
          onClick={step === 'type' ? handleClose : prevStep}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          {step === 'type' ? 'Cancel' : 'Back'}
        </button>
        {step === 'review' ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canAdvance || submitting}
            title="Submit (Ctrl+Enter)"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3 w-3" aria-hidden="true" />
            Submit
          </button>
        ) : (
          <button
            type="button"
            onClick={nextStep}
            disabled={!canAdvance}
            title="Next (Ctrl+Enter)"
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Recent requests */}
      {recentRequests.length > 0 && step === 'type' && (
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Your Recent Requests</p>
          <div className="space-y-1.5">
            {recentRequests.map((req) => {
              const statusCfg = STATUS_CONFIG[req.status] ?? { label: req.status, classes: 'bg-muted text-muted-foreground' };
              const isVoted = votedIds.has(req.id);
              return (
                <div key={req.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate text-xs text-foreground">{req.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleVote(req.id)}
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        isVoted
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                      aria-label={`Vote for ${req.title}`}
                      aria-pressed={isVoted}
                    >
                      <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                      {req.voteCount}
                    </button>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCfg.classes}`}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 1: Request Type ─────────────────────────────────────────

function StepType({
  selected,
  onSelect,
}: {
  selected: RequestType | null;
  onSelect: (type: RequestType) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-muted-foreground">What would you like to share?</legend>
      {REQUEST_TYPES.map(({ value, label, description, icon: Icon, color }) => (
        <button
          key={value}
          type="button"
          onClick={() => onSelect(value)}
          aria-pressed={selected === value}
          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
            selected === value
              ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/30'
              : 'border-border hover:border-indigo-500/40 hover:bg-accent'
          }`}
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </button>
      ))}
    </fieldset>
  );
}

// ── Step 2: Details ──────────────────────────────────────────────

function StepDetails({
  form,
  modules,
  submodules,
  onChange,
  attachments,
  attachmentWarning,
  onAddAttachment,
  onRemoveAttachment,
}: {
  form: FeatureRequestFormData;
  modules: { label: string; value: string; children: { label: string; value: string }[] }[];
  submodules: { label: string; value: string }[];
  onChange: <K extends keyof FeatureRequestFormData>(field: K, value: FeatureRequestFormData[K]) => void;
  attachments: Attachment[];
  attachmentWarning: string | null;
  onAddAttachment: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (index: number) => void;
}) {
  const titleLen = form.title.length;
  const descLen = form.description.length;

  return (
    <div className="space-y-3">
      {/* Module */}
      <div className="space-y-1">
        <label htmlFor="fr-module" className="block text-xs font-medium text-foreground">
          Module <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <select
          id="fr-module"
          value={form.module}
          onChange={(e) => onChange('module', e.target.value)}
          aria-required="true"
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Select a module...</option>
          {modules.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
          <option value="General">General / Platform</option>
        </select>
      </div>

      {/* Submodule */}
      {submodules.length > 0 && (
        <div className="space-y-1">
          <label htmlFor="fr-submodule" className="block text-xs font-medium text-foreground">
            Submodule
          </label>
          <select
            id="fr-submodule"
            value={form.submodule}
            onChange={(e) => onChange('submodule', e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Select a submodule (optional)...</option>
            {submodules.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Title */}
      <div className="space-y-1">
        <label htmlFor="fr-title" className="block text-xs font-medium text-foreground">
          Title <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id="fr-title"
          type="text"
          value={form.title}
          onChange={(e) => onChange('title', e.target.value)}
          maxLength={200}
          aria-required="true"
          aria-describedby="fr-title-counter"
          placeholder={form.requestType === 'bug' ? 'Brief description of the issue' : 'Brief summary of your idea'}
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <p id="fr-title-counter" className={`text-right text-[10px] ${titleLen > 180 ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {titleLen}/200
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label htmlFor="fr-description" className="block text-xs font-medium text-foreground">
          Description <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <textarea
          id="fr-description"
          value={form.description}
          onChange={(e) => onChange('description', e.target.value)}
          maxLength={2000}
          rows={4}
          aria-required="true"
          aria-describedby="fr-desc-counter"
          placeholder={
            form.requestType === 'bug'
              ? 'Steps to reproduce, what you expected, and what actually happened...'
              : 'Describe the feature or improvement in detail. What should it do? How would you use it?'
          }
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <p id="fr-desc-counter" className={`text-right text-[10px] ${descLen > 1800 ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {descLen}/2000
        </p>
      </div>

      {/* Screenshots (bug reports only) */}
      {form.requestType === 'bug' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Screenshots</p>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div key={att.name + idx} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                  <img src={att.dataUrl} alt={att.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(idx)}
                    className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Remove ${att.name}`}
                  >
                    <X className="h-4 w-4 text-foreground" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {attachments.length < MAX_ATTACHMENTS && (
            <label
              htmlFor="fr-screenshot"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-indigo-500/40 hover:text-foreground"
            >
              <Image className="h-3.5 w-3.5" aria-hidden="true" />
              Add Screenshot
              <input
                id="fr-screenshot"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={onAddAttachment}
                className="sr-only"
              />
            </label>
          )}
          <p className="text-[10px] text-muted-foreground">
            {attachments.length}/{MAX_ATTACHMENTS} &middot; Max 512KB each
          </p>
          {attachmentWarning && (
            <div className="flex items-start gap-1.5">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
              <p className="text-xs text-amber-500">{attachmentWarning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step 3: Impact & Priority ────────────────────────────────────

function StepImpact({
  form,
  onChange,
}: {
  form: FeatureRequestFormData;
  onChange: <K extends keyof FeatureRequestFormData>(field: K, value: FeatureRequestFormData[K]) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Priority */}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground">Priority</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priority level">
          {PRIORITIES.map(({ value, label, color }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.priority === value}
              onClick={() => onChange('priority', value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-all ${
                form.priority === value
                  ? `${color} scale-105`
                  : 'bg-muted text-muted-foreground ring-border hover:ring-indigo-500/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Business Impact */}
      <div className="space-y-1">
        <label htmlFor="fr-impact" className="block text-xs font-medium text-foreground">
          Business Impact
        </label>
        <textarea
          id="fr-impact"
          value={form.businessImpact}
          onChange={(e) => onChange('businessImpact', e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="How does this affect your business? Time saved, revenue impacted, customer experience..."
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Current Workaround (show for bugs and enhancements) */}
      {(form.requestType === 'bug' || form.requestType === 'enhancement') && (
        <div className="space-y-1">
          <label htmlFor="fr-workaround" className="block text-xs font-medium text-foreground">
            Current Workaround
          </label>
          <input
            id="fr-workaround"
            type="text"
            value={form.currentWorkaround}
            onChange={(e) => onChange('currentWorkaround', e.target.value)}
            maxLength={500}
            placeholder="How are you working around this today?"
            className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Additional notes */}
      <div className="space-y-1">
        <label htmlFor="fr-notes" className="block text-xs font-medium text-foreground">
          Additional Notes
        </label>
        <textarea
          id="fr-notes"
          value={form.additionalNotes}
          onChange={(e) => onChange('additionalNotes', e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Any other context, links, or examples..."
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
}

// ── Step 4: Review ───────────────────────────────────────────────

function StepReview({
  form,
  attachmentCount,
  similarRequests,
  loadingSimilar,
  onVoteSimilar,
  votedIds,
}: {
  form: FeatureRequestFormData;
  attachmentCount: number;
  similarRequests: SimilarRequest[];
  loadingSimilar: boolean;
  onVoteSimilar: (id: string) => Promise<void>;
  votedIds: Set<string>;
}) {
  const typeConfig = REQUEST_TYPES.find((t) => t.value === form.requestType);
  const priorityConfig = PRIORITIES.find((p) => p.value === form.priority);
  const TypeIcon = typeConfig?.icon ?? Sparkles;
  const [votedSimilarId, setVotedSimilarId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Review your submission before sending.</p>

      {/* Type + Priority badges */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeConfig?.color ?? ''}`}>
          <TypeIcon className="h-3 w-3" aria-hidden="true" />
          {typeConfig?.label}
        </span>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityConfig?.color ?? ''}`}>
          {priorityConfig?.label}
        </span>
      </div>

      {/* Module */}
      <ReviewField label="Module" value={form.submodule ? `${form.module} > ${form.submodule}` : form.module} />

      {/* Title */}
      <ReviewField label="Title" value={form.title} />

      {/* Description */}
      <ReviewField label="Description" value={form.description} multiline />

      {/* Business Impact */}
      {form.businessImpact && (
        <ReviewField label="Business Impact" value={form.businessImpact} multiline />
      )}

      {/* Workaround */}
      {form.currentWorkaround && (
        <ReviewField label="Current Workaround" value={form.currentWorkaround} />
      )}

      {/* Additional Notes */}
      {form.additionalNotes && (
        <ReviewField label="Additional Notes" value={form.additionalNotes} multiline />
      )}

      {/* Attachment count */}
      {attachmentCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2">
          <Paperclip className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            {attachmentCount} screenshot{attachmentCount > 1 ? 's' : ''} attached
          </p>
        </div>
      )}

      {/* Similar requests */}
      {loadingSimilar && (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">Checking for similar requests...</p>
        </div>
      )}
      {!loadingSimilar && similarRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-400">Similar Requests Found</p>
          <div className="space-y-1.5">
            {similarRequests.map((sr) => {
              const statusCfg = STATUS_CONFIG[sr.status] ?? { label: sr.status, classes: 'bg-muted text-muted-foreground' };
              const didVote = votedSimilarId === sr.id || votedIds.has(sr.id);
              return (
                <div key={sr.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-foreground">{sr.title}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusCfg.classes}`}>
                        {statusCfg.label}
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <ThumbsUp className="h-2.5 w-2.5" aria-hidden="true" />
                        {sr.voteCount}
                      </span>
                    </div>
                  </div>
                  {didVote ? (
                    <span className="shrink-0 text-[10px] font-medium text-indigo-400">Voted!</span>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await onVoteSimilar(sr.id);
                        setVotedSimilarId(sr.id);
                      }}
                      className="shrink-0 rounded-md bg-indigo-500/20 px-2 py-1 text-[10px] font-medium text-indigo-400 transition-colors hover:bg-indigo-500/30"
                    >
                      Vote instead?
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm text-foreground ${multiline ? 'whitespace-pre-wrap wrap-break-word' : 'truncate'}`}>{value}</p>
    </div>
  );
}
