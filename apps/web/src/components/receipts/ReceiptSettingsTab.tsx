'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  Printer,
  Type,
  QrCode,
  Receipt,
  Send,
  Smartphone,
  CircleAlert,
  Plus,
  X,
} from 'lucide-react';
import { useReceiptSettings } from '@/hooks/use-receipt-settings';
import { ReceiptPreview } from '@/components/receipts/ReceiptPreview';
import { buildReceiptDocument } from '@oppsera/shared';
import { DEFAULT_RECEIPT_SETTINGS } from '@oppsera/shared';
import type { ReceiptSettings, BuildReceiptInput, ReceiptVariant, ReceiptFontFamily } from '@oppsera/shared';
import { RECEIPT_FONT_FAMILIES, RECEIPT_FONT_LABELS } from '@oppsera/shared';

// ── Shared CSS classes ─────────────────────────────────────────

const INPUT =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60';
const SELECT =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60';
const CHECKBOX_LABEL =
  'flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm';

// ── Collapsible Section ────────────────────────────────────────

function Section({
  id,
  icon: Icon,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  icon: typeof Printer;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const saved = localStorage.getItem(`settings_receipts_${id}`);
    return saved !== null ? saved === 'true' : defaultOpen;
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(`settings_receipts_${id}`, String(next));
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
      </button>
      {open && <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={CHECKBOX_LABEL + (disabled ? ' opacity-60 cursor-not-allowed' : ' cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="flex-1">
        <span className="font-medium text-foreground">{label}</span>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
    </label>
  );
}

// ── Lines Editor (for customHeaderLines / customFooterLines) ──

function LinesEditor({
  lines,
  onChange,
  maxLines,
  placeholder,
  disabled,
}: {
  lines: string[];
  onChange: (lines: string[]) => void;
  maxLines: number;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={line}
            maxLength={100}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => {
              const next = [...lines];
              next[i] = e.target.value;
              onChange(next);
            }}
            className={INPUT}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Remove line"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {lines.length < maxLines && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...lines, ''])}
          className="flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-400 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add line
        </button>
      )}
    </div>
  );
}

// ── Sample Data for Live Preview ──────────────────────────────

function buildSampleInput(settings: ReceiptSettings, variant: ReceiptVariant): BuildReceiptInput {
  return {
    orderId: 'sample-001',
    orderNumber: '1042',
    orderDate: new Date().toISOString(),
    orderType: 'Dine-In',
    terminalId: 'T-01',
    serverName: 'Alex M.',
    tableNumber: '12',
    guestCount: 2,

    items: [
      {
        name: 'Grilled Salmon',
        qty: 1,
        unitPriceCents: 2495,
        lineTotalCents: 2495,
        modifiers: [
          { name: 'Extra Lemon', priceCents: 0 },
          { name: 'Side Caesar', priceCents: 350 },
        ],
        specialInstructions: 'No dill',
        isVoided: false,
        isComped: false,
        discountLabel: null,
        seatNumber: 1,
      },
      {
        name: 'Ribeye Steak 12oz',
        qty: 1,
        unitPriceCents: 3895,
        lineTotalCents: 3895,
        modifiers: [{ name: 'Medium Rare', priceCents: 0 }],
        specialInstructions: null,
        isVoided: false,
        isComped: false,
        discountLabel: null,
        seatNumber: 2,
      },
      {
        name: 'House Red Wine',
        qty: 2,
        unitPriceCents: 1200,
        lineTotalCents: 2400,
        modifiers: [],
        specialInstructions: null,
        isVoided: false,
        isComped: false,
        discountLabel: null,
        seatNumber: null,
      },
    ],

    subtotalCents: 9140,
    discounts: [{ label: 'Happy Hour (-10%)', amountCents: 914 }],
    charges: [{ label: 'Service Charge (18%)', amountCents: 1645 }],
    taxCents: 790,
    taxBreakdown: [
      { name: 'State Tax', rate: '6.0%', amountCents: 549 },
      { name: 'Local Tax', rate: '2.5%', amountCents: 241 },
    ],
    totalCents: 10661,

    tenders: [
      {
        method: 'card',
        label: 'VISA',
        amountCents: 10661,
        cardLast4: '4242',
        cardBrand: 'Visa',
        authCode: 'A12345',
        surchargeAmountCents: 0,
        tipCents: 2000,
      },
    ],
    changeCents: 0,

    businessName: 'The Grand Oak',
    locationName: 'Downtown',
    addressLines: ['123 Main Street', 'Springfield, IL 62704'],
    phone: '(555) 123-4567',
    taxId: '12-3456789',
    tenantSlug: 'grand-oak',

    customerName: 'Sarah J.',
    loyaltyPointsEarned: 107,
    loyaltyPointsBalance: 1520,
    memberNumber: 'M-00284',

    settings,
    variant,
    tenantId: 'sample-tenant',
    locationId: 'sample-location',
  };
}

// ── Variant Selector ──────────────────────────────────────────

const VARIANTS: { value: ReceiptVariant; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'merchant', label: 'Merchant Copy' },
  { value: 'gift', label: 'Gift Receipt' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'training', label: 'Training' },
];

// ── Main Component ────────────────────────────────────────────

export function ReceiptSettingsTab() {
  const { settings: savedSettings, isLoading, updateSettings } = useReceiptSettings();
  const [draft, setDraft] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewVariant, setPreviewVariant] = useState<ReceiptVariant>('standard');
  const initializedRef = useRef(false);

  // Sync draft from loaded settings (once)
  useEffect(() => {
    if (!isLoading && !initializedRef.current) {
      setDraft(savedSettings);
      initializedRef.current = true;
    }
  }, [isLoading, savedSettings]);

  // Detect if draft has changes
  const isDirty = useMemo(() => {
    if (!initializedRef.current) return false;
    return JSON.stringify(draft) !== JSON.stringify(savedSettings);
  }, [draft, savedSettings]);

  // Patch helper
  const patch = useCallback(<K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateSettings(draft);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [draft, updateSettings]);

  // Reset
  const handleReset = useCallback(() => {
    setDraft(savedSettings);
    setSaveError(null);
  }, [savedSettings]);

  // Build live preview document
  const previewDoc = useMemo(() => {
    try {
      const input = buildSampleInput(draft, previewVariant);
      return buildReceiptDocument(input);
    } catch {
      return null;
    }
  }, [draft, previewVariant]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="ml-2 text-sm text-muted-foreground">Loading receipt settings...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* ── Left: Settings Form ─────────────────────────── */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Printer */}
        <Section id="printer" icon={Printer} title="Printer">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Paper Width</label>
            <select
              value={draft.printerWidth}
              onChange={(e) => patch('printerWidth', e.target.value as '58mm' | '80mm')}
              className={SELECT}
            >
              <option value="80mm">80mm (standard thermal)</option>
              <option value="58mm">58mm (compact thermal)</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              80mm = 42 chars per line, 58mm = 32 chars per line
            </p>
          </div>
        </Section>

        {/* Typography */}
        <Section id="typography" icon={Type} title="Typography">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Font Family</label>
              <select
                value={draft.fontFamily}
                onChange={(e) => patch('fontFamily', e.target.value as ReceiptFontFamily)}
                className={SELECT}
              >
                {RECEIPT_FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>{RECEIPT_FONT_LABELS[f]}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Body Font Size</label>
                <input
                  type="number"
                  min={8}
                  max={16}
                  value={draft.bodyFontSizePx}
                  onChange={(e) => patch('bodyFontSizePx', Math.min(16, Math.max(8, Number(e.target.value))))}
                  className={INPUT}
                />
                <p className="mt-1 text-xs text-muted-foreground">8–16 px</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Header Font Size</label>
                <input
                  type="number"
                  min={10}
                  max={20}
                  value={draft.headerFontSizePx}
                  onChange={(e) => patch('headerFontSizePx', Math.min(20, Math.max(10, Number(e.target.value))))}
                  className={INPUT}
                />
                <p className="mt-1 text-xs text-muted-foreground">10–20 px</p>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Line Height</label>
              <input
                type="number"
                min={1.0}
                max={2.0}
                step={0.1}
                value={draft.lineHeight}
                onChange={(e) => patch('lineHeight', Math.min(2.0, Math.max(1.0, Number(e.target.value))))}
                className={INPUT}
              />
              <p className="mt-1 text-xs text-muted-foreground">1.0 (tight) – 2.0 (spacious)</p>
            </div>
          </div>
        </Section>

        {/* Header */}
        <Section id="header" icon={Receipt} title="Header">
          <div className="space-y-3">
            <Toggle
              label="Show Logo"
              description="Display business logo at top of receipt"
              checked={draft.showLogo}
              onChange={(v) => patch('showLogo', v)}
            />
            <Toggle
              label="Show Address"
              checked={draft.showAddress}
              onChange={(v) => patch('showAddress', v)}
            />
            <Toggle
              label="Show Phone Number"
              checked={draft.showPhone}
              onChange={(v) => patch('showPhone', v)}
            />
            <Toggle
              label="Show Tax ID"
              description="Required in some jurisdictions"
              checked={draft.showTaxId}
              onChange={(v) => patch('showTaxId', v)}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Custom Header Lines</label>
              <LinesEditor
                lines={draft.customHeaderLines}
                onChange={(lines) => patch('customHeaderLines', lines)}
                maxLines={5}
                placeholder="e.g. WiFi: GrandOak_Guest"
              />
            </div>
          </div>
        </Section>

        {/* Content */}
        <Section id="content" icon={Receipt} title="Content">
          <div className="space-y-3">
            <Toggle
              label="Show Modifiers"
              description="Display item modifiers (e.g. Medium Rare, Extra Cheese)"
              checked={draft.showModifiers}
              onChange={(v) => patch('showModifiers', v)}
            />
            <Toggle
              label="Show Special Instructions"
              description="Display customer special requests"
              checked={draft.showSpecialInstructions}
              onChange={(v) => patch('showSpecialInstructions', v)}
            />
            <Toggle
              label="Group Items by Seat"
              description="Organize line items under seat numbers"
              checked={draft.itemGroupBySeat}
              onChange={(v) => patch('itemGroupBySeat', v)}
            />
            <Toggle
              label="Show Tax Breakdown"
              description="Itemize tax by jurisdiction (state, local, etc.)"
              checked={draft.showTaxBreakdown}
              onChange={(v) => patch('showTaxBreakdown', v)}
            />
          </div>
        </Section>

        {/* Payment */}
        <Section id="payment" icon={Receipt} title="Payment & Signature" defaultOpen={false}>
          <div className="space-y-3">
            <Toggle
              label="Show Signature Line"
              description="Include tip and signature lines for card transactions"
              checked={draft.showSignatureLine}
              onChange={(v) => patch('showSignatureLine', v)}
            />
            <Toggle
              label="Merchant Copy"
              description="Print a second copy for the merchant"
              checked={draft.merchantCopyEnabled}
              onChange={(v) => patch('merchantCopyEnabled', v)}
            />
          </div>
        </Section>

        {/* QR Code */}
        <Section id="qr" icon={QrCode} title="QR Code" defaultOpen={false}>
          <div className="space-y-3">
            <Toggle
              label="Show QR Code"
              description="Display a scannable QR code on receipts"
              checked={draft.showQrCode}
              onChange={(v) => patch('showQrCode', v)}
            />
            {draft.showQrCode && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">QR Code Label</label>
                  <input
                    type="text"
                    value={draft.qrCodeLabel}
                    maxLength={100}
                    onChange={(e) => patch('qrCodeLabel', e.target.value)}
                    className={INPUT}
                    placeholder="e.g. Leave a review & earn rewards"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">QR Code URL</label>
                  <input
                    type="text"
                    value={draft.qrCodeUrlTemplate}
                    maxLength={500}
                    onChange={(e) => patch('qrCodeUrlTemplate', e.target.value)}
                    className={INPUT}
                    placeholder="/review/{{tenantSlug}}"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use {'{{token}}'} for digital receipt link or {'{{tenantSlug}}'} for your business slug
                  </p>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Digital Receipt */}
        <Section id="digital" icon={Smartphone} title="Digital Receipt" defaultOpen={false}>
          <div className="space-y-3">
            <Toggle
              label="Enable Digital Receipts"
              description="Generate a scannable QR code linking to a digital receipt microsite"
              checked={draft.digitalReceiptEnabled}
              onChange={(v) => patch('digitalReceiptEnabled', v)}
            />
            {draft.digitalReceiptEnabled && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Link Expiry (days)</label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={draft.digitalReceiptExpiryDays}
                    onChange={(e) => patch('digitalReceiptExpiryDays', Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                    className={INPUT}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Set to 0 for links that never expire
                  </p>
                </div>
                <Toggle
                  label="Loyalty Signup on Receipt"
                  description="Show a loyalty signup form on the digital receipt page"
                  checked={draft.loyaltySignupEnabled}
                  onChange={(v) => patch('loyaltySignupEnabled', v)}
                />
                <Toggle
                  label="Customer Survey"
                  description="Show a customer survey on the digital receipt page"
                  checked={draft.surveyEnabled}
                  disabled
                  onChange={() => {}}
                />
                <p className="ml-12 -mt-2 text-xs text-amber-500">Coming soon</p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Email From Name</label>
                  <input
                    type="text"
                    value={draft.emailReceiptFromName}
                    maxLength={100}
                    onChange={(e) => patch('emailReceiptFromName', e.target.value)}
                    className={INPUT}
                    placeholder="e.g. The Grand Oak"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Displayed as the sender name when receipts are emailed
                  </p>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Footer */}
        <Section id="footer" icon={Type} title="Footer" defaultOpen={false}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Thank You Message</label>
              <input
                type="text"
                value={draft.thankYouMessage}
                maxLength={200}
                onChange={(e) => patch('thankYouMessage', e.target.value)}
                className={INPUT}
                placeholder="Thank you for your visit!"
              />
            </div>
            <Toggle
              label="Show Return Policy"
              checked={draft.showReturnPolicy}
              onChange={(v) => patch('showReturnPolicy', v)}
            />
            {draft.showReturnPolicy && (
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Return Policy Text</label>
                <textarea
                  value={draft.returnPolicyText}
                  maxLength={500}
                  rows={3}
                  onChange={(e) => patch('returnPolicyText', e.target.value)}
                  className={INPUT + ' resize-none'}
                  placeholder="Items may be returned within 30 days with receipt..."
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Custom Footer Lines</label>
              <LinesEditor
                lines={draft.customFooterLines}
                onChange={(lines) => patch('customFooterLines', lines)}
                maxLines={5}
                placeholder="e.g. Follow us @thegrandoak"
              />
            </div>
          </div>
        </Section>

        {/* Loyalty */}
        <Section id="loyalty" icon={Receipt} title="Loyalty" defaultOpen={false}>
          <Toggle
            label="Show Loyalty Info"
            description="Display member points earned and balance when available"
            checked={draft.showLoyalty}
            onChange={(v) => patch('showLoyalty', v)}
          />
        </Section>

        {/* Delivery */}
        <Section id="delivery" icon={Send} title="Delivery Options" defaultOpen={false}>
          <div className="space-y-3">
            <Toggle
              label="Email Receipts"
              description="Allow sending receipts via email"
              checked={draft.emailReceiptEnabled}
              onChange={(v) => patch('emailReceiptEnabled', v)}
            />
            <Toggle
              label="Gift Receipts"
              description="Allow printing gift receipts (no prices shown)"
              checked={draft.giftReceiptEnabled}
              onChange={(v) => patch('giftReceiptEnabled', v)}
            />
            <Toggle
              label="Auto-Prompt Receipt"
              description="Prompt cashier for receipt delivery after payment"
              checked={draft.autoPromptReceipt}
              onChange={(v) => patch('autoPromptReceipt', v)}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Receipt Copies</label>
              <select
                value={draft.receiptCopies}
                onChange={(e) => patch('receiptCopies', Number(e.target.value))}
                className={SELECT}
              >
                <option value={1}>1 copy</option>
                <option value={2}>2 copies</option>
                <option value={3}>3 copies</option>
              </select>
            </div>
          </div>
        </Section>
      </div>

      {/* ── Right: Live Preview ─────────────────────────── */}
      <div className="w-full lg:w-80 xl:w-96 shrink-0">
        <div className="sticky top-4 space-y-3">
          {/* Variant selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-foreground shrink-0">Preview:</label>
            <select
              value={previewVariant}
              onChange={(e) => setPreviewVariant(e.target.value as ReceiptVariant)}
              className={SELECT}
            >
              {VARIANTS.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Receipt preview card */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="mx-auto max-w-[300px] rounded-lg border border-border bg-surface p-4">
              {previewDoc ? (
                <ReceiptPreview document={previewDoc} className="text-xs" />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Preview unavailable
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky Save Bar ─────────────────────────────── */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface px-6 py-3 shadow-lg">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <div className="flex items-center gap-2">
              {saveError ? (
                <>
                  <CircleAlert className="h-4 w-4 text-red-500" aria-hidden="true" />
                  <span className="text-sm text-red-500">{saveError}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">You have unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
