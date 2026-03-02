'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  CalendarCheck,
  DollarSign,
  XCircle,
  Clock,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useAuthContext } from '@/components/auth-provider';
import {
  useSpaBookingConfig,
  useSpaBookingStats,
  useUpdateBookingConfig,
} from '@/hooks/use-spa';
import type { BookingWidgetConfig } from '@/hooks/use-spa';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusColor(status: string): string {
  switch (status) {
    case 'scheduled':
    case 'confirmed':
      return 'bg-blue-500/10 text-blue-500';
    case 'checked_in':
    case 'in_service':
      return 'bg-amber-500/10 text-amber-500';
    case 'completed':
    case 'checked_out':
      return 'bg-green-500/10 text-green-500';
    case 'canceled':
    case 'no_show':
      return 'bg-red-500/10 text-red-500';
    default:
      return 'bg-gray-500/10 text-muted-foreground';
  }
}

// ── KPI Card ────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = 'indigo',
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-500',
    green: 'bg-green-500/10 text-green-500',
    amber: 'bg-amber-500/10 text-amber-500',
    red: 'bg-red-500/10 text-red-500',
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentMap[accent] ?? accentMap.indigo}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible Section ─────────────────────────────────────────

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
      >
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
    </div>
  );
}

// ── Toggle Field ────────────────────────────────────────────────

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="h-5 w-9 rounded-full bg-gray-600 peer-checked:bg-indigo-600 transition-colors" />
        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
      </div>
      <div className="min-w-0">
        <span className="text-sm text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </label>
  );
}

// ── Input Field ─────────────────────────────────────────────────

function InputField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  type?: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// ── TextArea Field ──────────────────────────────────────────────

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

// ── Select Field ────────────────────────────────────────────────

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Color Field ─────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-input bg-surface cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          className="flex-1 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>
    </div>
  );
}

// ── Sub-Section Header ──────────────────────────────────────────

function SubSectionHeader({ title }: { title: string }) {
  return (
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {title}
    </p>
  );
}

// ── Embed Code Generator ────────────────────────────────────────

function EmbedCodeSection({ tenantSlug }: { tenantSlug: string }) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const bookingUrl = `${origin}/book/${tenantSlug}/spa`;
  const embedUrl = `${origin}/book/${tenantSlug}/spa/embed`;
  const embedCode = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  allow="payment"\n  style="border: none; border-radius: 8px;"\n></iframe>`;

  const copyToClipboard = useCallback(
    (text: string, setCopied: (v: boolean) => void) => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Direct Booking Link
        </label>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={bookingUrl}
            className="flex-1 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground font-mono"
          />
          <button
            type="button"
            onClick={() => copyToClipboard(bookingUrl, setCopiedLink)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            {copiedLink ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copiedLink ? 'Copied' : 'Copy'}
          </button>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-border bg-surface p-1.5 hover:bg-accent"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Embed Code (iframe)
        </label>
        <div className="relative">
          <pre className="rounded-md border border-input bg-surface p-3 text-xs text-muted-foreground font-mono overflow-x-auto whitespace-pre">
            {embedCode}
          </pre>
          <button
            type="button"
            onClick={() => copyToClipboard(embedCode, setCopiedEmbed)}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground hover:bg-accent"
          >
            {copiedEmbed ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copiedEmbed ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Widget Config Panel ─────────────────────────────────────────

function WidgetConfigPanel({
  config,
}: {
  config: BookingWidgetConfig | null;
}) {
  const updateConfig = useUpdateBookingConfig();

  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const current = useMemo(() => {
    if (!config) return {} as Record<string, unknown>;
    return { ...config, ...draft };
  }, [config, draft]);

  const setField = useCallback(
    (key: string, value: unknown) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Helper for nested JSONB columns (businessIdentity, branding, etc.)
  const setJsonbField = useCallback(
    (column: string, subKey: string, value: unknown) => {
      setDraft((prev) => {
        const base = (config?.[column as keyof BookingWidgetConfig] ?? {}) as Record<string, unknown>;
        const draftCol = (prev[column] ?? {}) as Record<string, unknown>;
        return { ...prev, [column]: { ...base, ...draftCol, [subKey]: value } };
      });
    },
    [config],
  );

  // Read accessor merging config base + draft overlay for JSONB columns
  const jsonb = useCallback(
    (column: string): Record<string, unknown> => {
      const base = (config?.[column as keyof BookingWidgetConfig] ?? {}) as Record<string, unknown>;
      const draftCol = (draft[column] ?? {}) as Record<string, unknown>;
      return { ...base, ...draftCol };
    },
    [config, draft],
  );

  const hasChanges = Object.keys(draft).length > 0;

  const handleSave = useCallback(() => {
    if (!hasChanges) return;
    updateConfig.mutate(draft as Parameters<typeof updateConfig.mutate>[0], {
      onSuccess: () => setDraft({}),
    });
  }, [draft, hasChanges, updateConfig]);

  // Convenience accessors for JSONB columns
  const bi = jsonb('businessIdentity');
  const cl = jsonb('contactLocation');
  const br = jsonb('branding');
  const op = jsonb('operational');
  const lg = jsonb('legal');
  const se = jsonb('seo');

  return (
    <div className="space-y-4">
      {/* ── 1. Business Identity ── */}
      <div className="space-y-3">
        <SubSectionHeader title="Business Identity" />
        <InputField
          label="Business Name"
          value={(bi.businessName as string) ?? ''}
          onChange={(v) => setJsonbField('businessIdentity', 'businessName', v)}
          placeholder="Override tenant name for this widget"
        />
        <InputField
          label="Tagline"
          value={(bi.tagline as string) ?? ''}
          onChange={(v) => setJsonbField('businessIdentity', 'tagline', v)}
          placeholder="Relax. Recharge. Renew."
        />
        <TextAreaField
          label="Description"
          value={(bi.description as string) ?? ''}
          onChange={(v) => setJsonbField('businessIdentity', 'description', v)}
          placeholder="A brief description of your spa or wellness center"
          rows={3}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Email"
            value={(bi.email as string) ?? ''}
            onChange={(v) => setJsonbField('businessIdentity', 'email', v)}
            placeholder="spa@example.com"
          />
          <InputField
            label="Phone"
            value={(bi.phone as string) ?? ''}
            onChange={(v) => setJsonbField('businessIdentity', 'phone', v)}
            placeholder="(555) 123-4567"
          />
        </div>
        <InputField
          label="Website"
          value={(bi.website as string) ?? ''}
          onChange={(v) => setJsonbField('businessIdentity', 'website', v)}
          placeholder="https://..."
        />
      </div>

      {/* ── 2. Contact & Location ── */}
      <div className="space-y-3">
        <SubSectionHeader title="Contact & Location" />
        <InputField
          label="Address Line 1"
          value={(cl.addressLine1 as string) ?? ''}
          onChange={(v) => setJsonbField('contactLocation', 'addressLine1', v)}
          placeholder="123 Spa Lane"
        />
        <InputField
          label="Address Line 2"
          value={(cl.addressLine2 as string) ?? ''}
          onChange={(v) => setJsonbField('contactLocation', 'addressLine2', v)}
          placeholder="Suite 100"
        />
        <div className="grid grid-cols-3 gap-3">
          <InputField
            label="City"
            value={(cl.city as string) ?? ''}
            onChange={(v) => setJsonbField('contactLocation', 'city', v)}
          />
          <InputField
            label="State"
            value={(cl.state as string) ?? ''}
            onChange={(v) => setJsonbField('contactLocation', 'state', v)}
          />
          <InputField
            label="Postal Code"
            value={(cl.postalCode as string) ?? ''}
            onChange={(v) => setJsonbField('contactLocation', 'postalCode', v)}
          />
        </div>
        <InputField
          label="Country"
          value={(cl.country as string) ?? ''}
          onChange={(v) => setJsonbField('contactLocation', 'country', v)}
          placeholder="US"
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Latitude"
            value={(cl.latitude as string) ?? ''}
            onChange={(v) => setJsonbField('contactLocation', 'latitude', v)}
            placeholder="33.7490"
          />
          <InputField
            label="Longitude"
            value={(cl.longitude as string) ?? ''}
            onChange={(v) => setJsonbField('contactLocation', 'longitude', v)}
            placeholder="-84.3880"
          />
        </div>
        <InputField
          label="Directions URL"
          value={(cl.directionsUrl as string) ?? ''}
          onChange={(v) => setJsonbField('contactLocation', 'directionsUrl', v)}
          placeholder="https://maps.google.com/..."
        />
        <TextAreaField
          label="Parking Info"
          value={(cl.parkingInfo as string) ?? ''}
          onChange={(v) => setJsonbField('contactLocation', 'parkingInfo', v)}
          placeholder="Free parking available in the rear lot"
          rows={2}
        />
        <TextAreaField
          label="Accessibility Info"
          value={(cl.accessibilityInfo as string) ?? ''}
          onChange={(v) => setJsonbField('contactLocation', 'accessibilityInfo', v)}
          placeholder="Wheelchair accessible entrance and treatment rooms"
          rows={2}
        />
      </div>

      {/* ── 3. Branding & Appearance ── */}
      <div className="space-y-3">
        <SubSectionHeader title="Branding & Appearance" />
        <InputField
          label="Logo URL"
          value={(current.logoUrl as string) ?? ''}
          onChange={(v) => setField('logoUrl', v)}
          placeholder="https://..."
        />
        <InputField
          label="Favicon URL"
          value={(br.faviconUrl as string) ?? ''}
          onChange={(v) => setJsonbField('branding', 'faviconUrl', v)}
          placeholder="https://..."
        />
        <InputField
          label="Banner Image URL"
          value={(br.bannerImageUrl as string) ?? ''}
          onChange={(v) => setJsonbField('branding', 'bannerImageUrl', v)}
          placeholder="https://..."
        />
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Primary Color"
            value={(br.primaryColor as string) ?? '#4f46e5'}
            onChange={(v) => setJsonbField('branding', 'primaryColor', v)}
          />
          <ColorField
            label="Secondary Color"
            value={(br.secondaryColor as string) ?? '#6366f1'}
            onChange={(v) => setJsonbField('branding', 'secondaryColor', v)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label="Background Color"
            value={(br.backgroundColor as string) ?? '#ffffff'}
            onChange={(v) => setJsonbField('branding', 'backgroundColor', v)}
          />
          <ColorField
            label="Text Color"
            value={(br.textColor as string) ?? '#111827'}
            onChange={(v) => setJsonbField('branding', 'textColor', v)}
          />
        </div>
        <InputField
          label="Font Family"
          value={(br.fontFamily as string) ?? ''}
          onChange={(v) => setJsonbField('branding', 'fontFamily', v)}
          placeholder="Inter, system-ui, sans-serif"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Button Style"
            value={(br.buttonStyle as string) ?? 'rounded'}
            onChange={(v) => setJsonbField('branding', 'buttonStyle', v)}
            options={[
              { value: 'rounded', label: 'Rounded' },
              { value: 'square', label: 'Square' },
              { value: 'pill', label: 'Pill' },
            ]}
          />
          <SelectField
            label="Header Layout"
            value={(br.headerLayout as string) ?? 'centered'}
            onChange={(v) => setJsonbField('branding', 'headerLayout', v)}
            options={[
              { value: 'centered', label: 'Centered' },
              { value: 'left-aligned', label: 'Left Aligned' },
            ]}
          />
        </div>
        <TextAreaField
          label="Custom CSS"
          value={(current.customCss as string) ?? ''}
          onChange={(v) => setField('customCss', v)}
          placeholder=".booking-widget { ... }"
          rows={3}
          mono
        />
      </div>

      {/* ── 4. Display ── */}
      <div className="space-y-2">
        <SubSectionHeader title="Display" />
        <ToggleField
          label="Show Prices"
          checked={current.showPrices as boolean ?? true}
          onChange={(v) => setField('showPrices', v)}
        />
        <ToggleField
          label="Show Provider Photos"
          checked={current.showProviderPhotos as boolean ?? true}
          onChange={(v) => setField('showProviderPhotos', v)}
        />
        <ToggleField
          label="Allow Provider Selection"
          description="Let guests choose their provider"
          checked={current.allowProviderSelection as boolean ?? true}
          onChange={(v) => setField('allowProviderSelection', v)}
        />
        <ToggleField
          label="Allow Add-on Selection"
          checked={current.allowAddonSelection as boolean ?? true}
          onChange={(v) => setField('allowAddonSelection', v)}
        />
      </div>

      {/* ── 5. Booking Flow ── */}
      <div className="space-y-3">
        <SubSectionHeader title="Booking Flow" />
        <InputField
          label="Welcome Message"
          value={(current.welcomeMessage as string) ?? ''}
          onChange={(v) => setField('welcomeMessage', v)}
          placeholder="Book your next appointment online"
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Lead Time"
            type="number"
            value={current.bookingLeadTimeHours as number ?? 2}
            onChange={(v) => setField('bookingLeadTimeHours', Number(v))}
            suffix="hours"
          />
          <InputField
            label="Max Advance"
            type="number"
            value={current.maxAdvanceBookingDays as number ?? 90}
            onChange={(v) => setField('maxAdvanceBookingDays', Number(v))}
            suffix="days"
          />
        </div>
        <InputField
          label="Redirect URL (after booking)"
          value={(current.redirectUrl as string) ?? ''}
          onChange={(v) => setField('redirectUrl', v)}
          placeholder="https://..."
        />
      </div>

      {/* ── 6. Deposits ── */}
      <div className="space-y-2">
        <SubSectionHeader title="Deposits" />
        <ToggleField
          label="Require Deposit"
          checked={current.requireDeposit as boolean ?? false}
          onChange={(v) => setField('requireDeposit', v)}
        />
        {(current.requireDeposit as boolean) && (
          <div className="grid grid-cols-2 gap-3 pl-12">
            <SelectField
              label="Type"
              value={(current.depositType as string) ?? 'percentage'}
              onChange={(v) => setField('depositType', v)}
              options={[
                { value: 'percentage', label: 'Percentage' },
                { value: 'flat', label: 'Flat Amount' },
              ]}
            />
            <InputField
              label="Value"
              type="number"
              value={current.depositValue as number ?? 0}
              onChange={(v) => setField('depositValue', Number(v))}
              suffix={
                (current.depositType as string) === 'flat' ? '$' : '%'
              }
            />
          </div>
        )}
      </div>

      {/* ── 7. Cancellation ── */}
      <div className="space-y-2">
        <SubSectionHeader title="Cancellation" />
        <InputField
          label="Window"
          type="number"
          value={current.cancellationWindowHours as number ?? 24}
          onChange={(v) => setField('cancellationWindowHours', Number(v))}
          suffix="hours before"
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Fee Type"
            value={(current.cancellationFeeType as string) ?? 'none'}
            onChange={(v) => setField('cancellationFeeType', v)}
            options={[
              { value: 'none', label: 'None' },
              { value: 'percentage', label: 'Percentage' },
              { value: 'flat', label: 'Flat Amount' },
            ]}
          />
          {(current.cancellationFeeType as string) !== 'none' && (
            <InputField
              label="Fee Value"
              type="number"
              value={current.cancellationFeeValue as number ?? 0}
              onChange={(v) => setField('cancellationFeeValue', Number(v))}
              suffix={
                (current.cancellationFeeType as string) === 'flat'
                  ? '$'
                  : '%'
              }
            />
          )}
        </div>
      </div>

      {/* ── 8. Legal & Compliance ── */}
      <div className="space-y-3">
        <SubSectionHeader title="Legal & Compliance" />
        <InputField
          label="Privacy Policy URL"
          value={(lg.privacyPolicyUrl as string) ?? ''}
          onChange={(v) => setJsonbField('legal', 'privacyPolicyUrl', v)}
          placeholder="https://..."
        />
        <InputField
          label="Terms of Service URL"
          value={(lg.termsOfServiceUrl as string) ?? ''}
          onChange={(v) => setJsonbField('legal', 'termsOfServiceUrl', v)}
          placeholder="https://..."
        />
        <TextAreaField
          label="Cancellation Policy Text"
          value={(lg.cancellationPolicyText as string) ?? ''}
          onChange={(v) => setJsonbField('legal', 'cancellationPolicyText', v)}
          placeholder="Cancellations must be made at least 24 hours in advance..."
          rows={3}
        />
        <InputField
          label="Consent Checkbox Text"
          value={(lg.consentCheckboxText as string) ?? ''}
          onChange={(v) => setJsonbField('legal', 'consentCheckboxText', v)}
          placeholder="I agree to the terms and privacy policy"
        />
        <InputField
          label="Accessibility Statement URL"
          value={(lg.accessibilityStatementUrl as string) ?? ''}
          onChange={(v) => setJsonbField('legal', 'accessibilityStatementUrl', v)}
          placeholder="https://..."
        />
      </div>

      {/* ── 9. Operational & SEO ── */}
      <div className="space-y-3">
        <SubSectionHeader title="Operational & SEO" />
        <InputField
          label="Timezone Display"
          value={(op.timezoneDisplay as string) ?? ''}
          onChange={(v) => setJsonbField('operational', 'timezoneDisplay', v)}
          placeholder="America/New_York"
        />
        <TextAreaField
          label="Holiday Notice"
          value={(op.holidayNotice as string) ?? ''}
          onChange={(v) => setJsonbField('operational', 'holidayNotice', v)}
          placeholder="We will be closed Dec 25 – Jan 1"
          rows={2}
        />
        <TextAreaField
          label="Special Instructions"
          value={(op.specialInstructions as string) ?? ''}
          onChange={(v) => setJsonbField('operational', 'specialInstructions', v)}
          placeholder="Please arrive 15 minutes early for your first visit"
          rows={2}
        />
        <TextAreaField
          label="Health & Safety Notice"
          value={(op.healthSafetyNotice as string) ?? ''}
          onChange={(v) => setJsonbField('operational', 'healthSafetyNotice', v)}
          placeholder="All treatment rooms are sanitized between sessions"
          rows={2}
        />
        <InputField
          label="Meta Title"
          value={(se.metaTitle as string) ?? ''}
          onChange={(v) => setJsonbField('seo', 'metaTitle', v)}
          placeholder="Book a Spa Appointment | Your Spa Name"
        />
        <TextAreaField
          label="Meta Description"
          value={(se.metaDescription as string) ?? ''}
          onChange={(v) => setJsonbField('seo', 'metaDescription', v)}
          placeholder="Book spa treatments and wellness services online"
          rows={2}
        />
        <InputField
          label="OG Image URL"
          value={(se.ogImage as string) ?? ''}
          onChange={(v) => setJsonbField('seo', 'ogImage', v)}
          placeholder="https://..."
        />
        <InputField
          label="Canonical URL"
          value={(se.canonicalUrl as string) ?? ''}
          onChange={(v) => setJsonbField('seo', 'canonicalUrl', v)}
          placeholder="https://..."
        />
      </div>

      {/* Save */}
      {hasChanges && (
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {updateConfig.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            Save Changes
          </button>
          <button
            type="button"
            onClick={() => setDraft({})}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

// ── Recent Bookings Table ───────────────────────────────────────

function RecentBookingsTable({
  bookings,
}: {
  bookings: Array<{
    appointmentId: string;
    guestName: string | null;
    guestEmail: string | null;
    serviceName: string;
    providerName: string | null;
    startAt: string;
    status: string;
    depositAmountCents: number;
    createdAt: string;
  }>;
}) {
  if (bookings.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No online bookings yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Guest</th>
            <th className="py-2 pr-3 font-medium">Service</th>
            <th className="py-2 pr-3 font-medium">Provider</th>
            <th className="py-2 pr-3 font-medium">Date</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium text-right">Deposit</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr
              key={b.appointmentId}
              className="border-b border-border last:border-0 hover:bg-accent"
            >
              <td className="py-2 pr-3">
                <div className="text-foreground">
                  {b.guestName ?? 'Guest'}
                </div>
                {b.guestEmail && (
                  <div className="text-xs text-muted-foreground">
                    {b.guestEmail}
                  </div>
                )}
              </td>
              <td className="py-2 pr-3 text-foreground">{b.serviceName}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {b.providerName ?? '—'}
              </td>
              <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                {formatDateTime(b.startAt)}
              </td>
              <td className="py-2 pr-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(b.status)}`}
                >
                  {b.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                {b.depositAmountCents > 0
                  ? formatMoney(b.depositAmountCents)
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Content ────────────────────────────────────────────────

export default function BookingContent() {
  const { tenant } = useAuthContext();
  const { data: config, isLoading: configLoading } = useSpaBookingConfig();
  const { data: stats, isLoading: statsLoading } = useSpaBookingStats();

  const tenantSlug = tenant?.slug ?? '';

  if (configLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-6 w-40 animate-pulse rounded bg-accent" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-accent" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-border bg-surface"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Online Booking
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your booking portal, embed it on your website, and track
          online bookings
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Online Bookings"
          value={String(stats?.bookingsThisPeriod ?? 0)}
          icon={CalendarCheck}
          accent="indigo"
        />
        <KpiCard
          label="Online Revenue"
          value={formatMoney(stats?.onlineRevenueCents ?? 0)}
          icon={DollarSign}
          accent="green"
        />
        <KpiCard
          label="Avg Lead Time"
          value={`${(stats?.avgLeadTimeDays ?? 0).toFixed(1)}d`}
          icon={Clock}
          accent="amber"
        />
        <KpiCard
          label="Cancellation Rate"
          value={`${((stats?.cancellationRate ?? 0) * 100).toFixed(1)}%`}
          icon={XCircle}
          accent="red"
        />
      </div>

      {/* Two-column layout: Config + Embed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Widget Configuration */}
        <Section title="Widget Configuration" defaultOpen>
          <WidgetConfigPanel config={config} />
        </Section>

        {/* Embed & Share */}
        <div className="space-y-6">
          <Section title="Embed & Share" defaultOpen>
            {tenantSlug ? (
              <EmbedCodeSection tenantSlug={tenantSlug} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Configure your tenant slug in Settings to enable the booking
                portal.
              </p>
            )}
          </Section>

          {/* Quick Stats */}
          {stats && stats.topServices.length > 0 && (
            <Section title="Top Services (Online)" defaultOpen={false}>
              <div className="space-y-2">
                {stats.topServices.map((s) => (
                  <div
                    key={s.serviceId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-foreground">{s.serviceName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.bookingCount} bookings
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* Recent Online Bookings */}
      <Section title="Recent Online Bookings" defaultOpen>
        <RecentBookingsTable bookings={stats?.recentBookings ?? []} />
      </Section>
    </div>
  );
}
