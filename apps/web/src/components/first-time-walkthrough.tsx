'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Monitor, LogOut, X, ChevronRight } from 'lucide-react';

const WALKTHROUGH_KEY = 'oppsera:walkthrough-completed';

interface WalkthroughStep {
  title: string;
  description: string;
  icon: typeof MapPin;
  iconColor: string;
}

const STEPS: WalkthroughStep[] = [
  {
    title: 'Your Location',
    description: 'This shows which location you\'re logged into. All orders and KDS screens are tied to this location.',
    icon: MapPin,
    iconColor: '#6366f1',
  },
  {
    title: 'Your Register',
    description: 'This is the register (terminal) you\'re working on. You can change it anytime from the sidebar.',
    icon: Monitor,
    iconColor: '#10b981',
  },
  {
    title: 'Change Register',
    description: 'Need to switch? Click "Change Register" in the sidebar to pick a different register without logging out.',
    icon: ChevronRight,
    iconColor: '#f59e0b',
  },
  {
    title: 'Sign Out',
    description: 'When you\'re done, click "Sign Out" at the bottom of the sidebar. Your register selection will be remembered for next time.',
    icon: LogOut,
    iconColor: '#ef4444',
  },
];

export function FirstTimeWalkthrough() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(WALKTHROUGH_KEY);
      if (!completed) setShow(true);
    } catch { /* ignore */ }
  }, []);

  const dismiss = useCallback(() => {
    setShow(false);
    try { localStorage.setItem(WALKTHROUGH_KEY, 'true'); } catch { /* ignore */ }
  }, []);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, dismiss]);

  if (!show || typeof document === 'undefined') return null;

  const current = STEPS[step]!;
  const Icon = current.icon;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60" />

      {/* Card */}
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        {/* Skip button */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-foreground/50 hover:text-foreground transition-colors"
          aria-label="Skip walkthrough"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-indigo-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: `${current.iconColor}20` }}
        >
          <Icon className="h-7 w-7" style={{ color: current.iconColor }} />
        </div>

        {/* Content */}
        <h3 className="text-center text-lg font-semibold text-foreground">{current.title}</h3>
        <p className="mt-2 text-center text-sm leading-relaxed text-foreground/70">
          {current.description}
        </p>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              style={{ minHeight: '44px' }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            style={{ minHeight: '44px' }}
          >
            {step < STEPS.length - 1 ? 'Next' : 'Got It!'}
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-foreground/40">
          Step {step + 1} of {STEPS.length}
        </p>
      </div>
    </div>,
    document.body,
  );
}
