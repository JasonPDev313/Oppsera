'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Building2, Search, AlertTriangle, ShieldCheck, Ban, Eraser, ArrowLeft, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { formatCents } from '@oppsera/shared';
import { apiFetch, ApiError } from '@/lib/api-client';

export interface HouseAccountMeta {
  billingAccountId: string;
  customerId: string;
  signatureData?: string;
}

interface CustomerAccount {
  customerId: string;
  customerName: string;
  memberNumber: string | null;
  billingAccountId: string;
  accountName: string;
  creditLimitCents: number;
  outstandingBalanceCents: number;
  availableCreditCents: number | null;
  spendingLimitCents: number | null;
}

interface HouseAccountPanelProps {
  remainingCents: number;
  onCharge: (amountCents: number, meta: HouseAccountMeta) => void;
  onCancel: () => void;
  disabled?: boolean;
  /** Manager PIN verification for credit limit overrides */
  onManagerOverride?: (callback: () => void) => void;
}

// ── Inline Signature Pad (standard Tailwind) ──────────────────────

function RetailSignaturePad({ onSignature }: { onSignature: (data: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0]!;
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [getPos]);

  const endDraw = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setHasStrokes(true);
    const canvas = canvasRef.current;
    if (canvas) onSignature(canvas.toDataURL('image/png'));
  }, [onSignature]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onSignature(null);
  }, [onSignature]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Signature (required)
        </span>
        {hasStrokes && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Eraser className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={300}
        height={100}
        className="w-full rounded-lg border border-border bg-muted touch-none"
        style={{ cursor: 'crosshair', height: '100px' }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      {!hasStrokes && (
        <span className="text-center text-xs text-muted-foreground">
          Sign above to authorize charge
        </span>
      )}
    </div>
  );
}

// ── Search Skeleton ───────────────────────────────────────────────

function AccountSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3 animate-pulse">
      <div className="grid grid-cols-2 gap-2">
        <div><div className="h-3 w-16 rounded bg-muted mb-1" /><div className="h-5 w-28 rounded bg-muted" /></div>
        <div><div className="h-3 w-16 rounded bg-muted mb-1" /><div className="h-5 w-20 rounded bg-muted" /></div>
        <div><div className="h-3 w-16 rounded bg-muted mb-1" /><div className="h-5 w-24 rounded bg-muted" /></div>
        <div><div className="h-3 w-16 rounded bg-muted mb-1" /><div className="h-5 w-20 rounded bg-muted" /></div>
      </div>
      <div className="h-25 rounded-lg bg-muted" />
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────

export function HouseAccountPanel({
  remainingCents,
  onCharge,
  onCancel,
  disabled,
  onManagerOverride,
}: HouseAccountPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (q.length < 2) {
      setError('Enter at least 2 characters to search');
      return;
    }

    // Abort any in-flight search
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setError('');
    setAccount(null);
    setSignatureData(null);
    try {
      const res = await apiFetch<{ data: CustomerAccount }>(
        `/api/v1/payments/house-account/lookup?q=${encodeURIComponent(q)}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setAccount(res.data);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiError) {
        // Surface specific CMAA block reasons from the API
        const codeMap: Record<string, string> = {
          CUSTOMER_INACTIVE: 'Customer account is inactive — house charges are not permitted.',
          ACCOUNT_SUSPENDED: 'Billing account is suspended — contact the front office.',
          ACCOUNT_IN_COLLECTIONS: 'Account is in collections — new charges are blocked.',
          NOT_HOUSE_ACCOUNT: 'No house account on file for this customer.',
          CHARGE_NOT_ALLOWED: 'This member is not authorized to charge to this account.',
        };
        const code = (err as ApiError & { code?: string }).code;
        setError(code && codeMap[code] ? codeMap[code] : err.message);
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError('Customer not found or no house account on file');
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, [searchQuery]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => { searchAbortRef.current?.abort(); };
  }, []);

  // Reset search state when switching back
  const handleClearAccount = useCallback(() => {
    setAccount(null);
    setSignatureData(null);
    setError('');
    setSearchQuery('');
    // Re-focus search input after clearing
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  // Memoize derived charge calculations
  const { effectiveAvailableCents, chargeAmount, exceedsCredit } = useMemo(() => {
    if (!account) return { effectiveAvailableCents: null, chargeAmount: 0, exceedsCredit: false };

    const caps: number[] = [];
    if (account.availableCreditCents != null) caps.push(account.availableCreditCents);
    if (account.spendingLimitCents != null) caps.push(account.spendingLimitCents);
    const effective = caps.length > 0 ? Math.min(...caps) : null;

    const charge = effective != null
      ? Math.min(effective, remainingCents)
      : remainingCents;

    const exceeds = effective != null ? remainingCents > effective : false;

    return { effectiveAvailableCents: effective, chargeAmount: charge, exceedsCredit: exceeds };
  }, [account, remainingCents]);

  const buildMeta = useCallback((): HouseAccountMeta | undefined => {
    if (!account) return undefined;
    return {
      billingAccountId: account.billingAccountId,
      customerId: account.customerId,
      signatureData: signatureData ?? undefined,
    };
  }, [account, signatureData]);

  const handleCharge = useCallback(() => {
    if (!account || chargeAmount <= 0 || disabled) return;
    const meta = buildMeta();
    if (meta) onCharge(chargeAmount, meta);
  }, [account, chargeAmount, onCharge, buildMeta, disabled]);

  const handleOverrideCharge = useCallback(() => {
    const meta = buildMeta();
    if (meta) onCharge(remainingCents, meta);
  }, [remainingCents, onCharge, buildMeta]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Building2 className="h-5 w-5 text-purple-500" />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-foreground">House Account</h2>
          <p className="text-sm text-muted-foreground">
            Charge: <span className="font-semibold text-foreground">{formatCents(remainingCents)}</span>
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Customer search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Member #, name, email, or phone"
              className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              disabled={disabled}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={disabled || isSearching || !searchQuery.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {isSearching ? 'Finding...' : 'Find'}
          </button>
        </div>

        {/* Loading skeleton */}
        {isSearching && <AccountSkeleton />}

        {/* Error / block reason */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
            <Ban className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => { setError(''); searchInputRef.current?.focus(); }}
                className="mt-1 text-xs text-red-400/70 underline underline-offset-2 hover:text-red-400"
              >
                Try a different search
              </button>
            </div>
          </div>
        )}

        {/* Account info */}
        {account && !isSearching && (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            {/* Customer header with change button */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-foreground">{account.customerName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {account.memberNumber && (
                    <span className="font-mono">#{account.memberNumber}</span>
                  )}
                  <span>{account.accountName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearAccount}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Change
              </button>
            </div>

            {/* Account details — compact horizontal layout */}
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-2.5">
              <div className="text-center">
                <span className="block text-[10px] font-medium uppercase text-muted-foreground">Limit</span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {account.creditLimitCents > 0 ? formatCents(account.creditLimitCents) : '∞'}
                </span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] font-medium uppercase text-muted-foreground">Owed</span>
                <span className={`font-mono text-sm font-semibold ${account.outstandingBalanceCents > 0 ? 'text-amber-500' : 'text-foreground'}`}>
                  {formatCents(account.outstandingBalanceCents)}
                </span>
              </div>
              <div className="text-center">
                <span className="block text-[10px] font-medium uppercase text-muted-foreground">Available</span>
                <span className={`font-mono text-sm font-bold ${
                  account.availableCreditCents == null || account.availableCreditCents > 0
                    ? 'text-green-500'
                    : 'text-red-500'
                }`}>
                  {account.availableCreditCents != null
                    ? formatCents(account.availableCreditCents)
                    : '∞'}
                </span>
              </div>
            </div>

            {account.spendingLimitCents != null && (
              <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs">
                <span className="text-amber-500">Member Spending Limit</span>
                <span className="font-mono font-semibold text-amber-500">{formatCents(account.spendingLimitCents)}</span>
              </div>
            )}

            {/* Warning if charge exceeds available credit */}
            {exceedsCredit && effectiveAvailableCents != null && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  Exceeds credit by <span className="font-semibold">{formatCents(remainingCents - effectiveAvailableCents)}</span>
                  {chargeAmount > 0 && <> — will charge {formatCents(chargeAmount)} (partial)</>}
                </span>
              </div>
            )}

            {/* Signature capture (CMAA requirement) */}
            <RetailSignaturePad onSignature={setSignatureData} />

            {/* Charge summary */}
            {signatureData && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Ready to charge <span className="font-bold">{formatCents(chargeAmount)}</span> to {account.customerName}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: Cancel / Charge */}
      {account && !isSearching && (
        <div className="flex gap-3 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-input px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCharge}
            disabled={disabled || chargeAmount <= 0 || !signatureData}
            className="flex-[2] rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {disabled
              ? 'Processing...'
              : !signatureData
                ? 'Sign to Charge'
                : `Charge ${formatCents(chargeAmount)}`}
          </button>

          {/* Override button for when exceeds credit */}
          {exceedsCredit && onManagerOverride && (
            <button
              type="button"
              onClick={() => onManagerOverride(handleOverrideCharge)}
              disabled={disabled || !signatureData}
              className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs font-bold text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
            >
              <ShieldCheck className="h-4 w-4" />
              Override
            </button>
          )}
        </div>
      )}
    </div>
  );
}
