'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';

interface ConditionDetail {
  metric: string;
  operator: string;
  threshold: string | number;
  actualValue: string | number;
  passed: boolean;
}

interface EvidencePayload {
  ruleId: string;
  ruleName: string;
  evaluatedAt: string;
  overallResult: boolean;
  conditionDetails: ConditionDetail[];
}

interface TagEvidenceTooltipProps {
  evidence: unknown;
  tagName: string;
  children: React.ReactNode;
}

function parseEvidence(evidence: unknown): EvidencePayload | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const e = evidence as Record<string, unknown>;
  if (typeof e.ruleId !== 'string' || typeof e.ruleName !== 'string') return null;
  if (!Array.isArray(e.conditionDetails)) return null;
  return evidence as EvidencePayload;
}

function formatOperator(op: string): string {
  const map: Record<string, string> = {
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    eq: '=',
    ne: '!=',
    contains: 'contains',
    not_contains: 'not contains',
  };
  return map[op] ?? op;
}

function TooltipContent({ evidence }: { evidence: EvidencePayload }) {
  return (
    <div className="max-w-xs rounded-lg bg-gray-900 p-3 text-white shadow-lg">
      <p className="mb-2 text-xs font-semibold">
        Applied by rule: {evidence.ruleName}
      </p>

      {evidence.conditionDetails.length > 0 && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-700 text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Metric</th>
              <th className="pb-1 pr-2 font-medium">Threshold</th>
              <th className="pb-1 pr-2 font-medium">Actual</th>
              <th className="pb-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {evidence.conditionDetails.map((c, i) => (
              <tr key={i} className="border-b border-gray-800 last:border-0">
                <td className="py-1 pr-2 text-muted-foreground">{c.metric}</td>
                <td className="py-1 pr-2 text-muted-foreground">
                  {formatOperator(c.operator)} {String(c.threshold)}
                </td>
                <td className="py-1 pr-2 font-medium text-white">
                  {String(c.actualValue)}
                </td>
                <td className="py-1">
                  {c.passed ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <X className="h-3 w-3 text-red-400" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {evidence.evaluatedAt && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Evaluated{' '}
          {new Date(evidence.evaluatedAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}

export function TagEvidenceTooltip({
  evidence,
  tagName: _tagName,
  children,
}: TagEvidenceTooltipProps) {
  const parsed = parseEvidence(evidence);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const tooltipHeight = 160; // approximate max height
    const spaceAbove = rect.top;
    const showAbove = spaceAbove > tooltipHeight + 8;

    setPosition({
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, rect.left + rect.width / 2 - 140), // center, clamped
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // If evidence is null/unparseable, just render children
  if (!parsed) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {visible &&
        position &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{
              top: position.top,
              left: position.left,
              transform: position.top < (wrapperRef.current?.getBoundingClientRect().top ?? 0)
                ? 'translateY(-100%)'
                : 'translateY(0)',
            }}
          >
            <TooltipContent evidence={parsed} />
          </div>,
          document.body,
        )}
    </div>
  );
}
