'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@/hooks/use-mutation';
import { useToast } from '@/components/ui/toast';
import { useAuthContext } from '@/components/auth-provider';
import {
  Settings, Palette, Bell, Users, FileText, Clock, Loader2,
  Save, ExternalLink, Copy, Check, ChevronDown, ChevronRight,
  Plus, Trash2, QrCode,
} from 'lucide-react';
import { QrCodeDisplay } from '@/components/fnb/host/QrCodeDisplay';

// ── Types ────────────────────────────────────────────────────────

interface WaitlistConfigData {
  id: string;
  enabled: boolean;
  slugOverride: string | null;
  formConfig: {
    minPartySize: number;
    maxPartySize: number;
    requirePhone: boolean;
    enableSeatingPreference: boolean;
    seatingOptions: string[];
    enableOccasion: boolean;
    occasionOptions: string[];
    enableNotes: boolean;
    notesMaxLength: number;
    customFields: { label: string; type: string; required: boolean; options?: string[] }[];
    termsText: string | null;
  };
  notificationConfig: {
    confirmationTemplate: string;
    readyTemplate: string;
    cancellationTemplate: string;
    reminderEnabled: boolean;
    reminderTemplate: string | null;
    reminderAfterMinutes: number;
    graceMinutes: number;
    autoRemoveAfterGrace: boolean;
  };
  queueConfig: {
    maxCapacity: number;
    estimationMethod: string;
    autoPromotionEnabled: boolean;
    promotionLogic: string;
    priorityLevels: string[];
    pacingEnabled: boolean;
    pacingMaxPerInterval: number;
    pacingIntervalMinutes: number;
    allowCheckWaitBeforeJoining: boolean;
  };
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string | null;
    fontFamily: string;
    welcomeHeadline: string;
    welcomeSubtitle: string;
    footerText: string | null;
    customCss: string | null;
  };
  contentConfig: {
    whileYouWaitEnabled: boolean;
    whileYouWaitType: string;
    whileYouWaitContent: string | null;
    whileYouWaitUrl: string | null;
  };
  operatingHours: {
    useBusinessHours: boolean;
    customHours: Record<string, { open: string; close: string }> | null;
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-muted-foreground/30'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </button>
    </label>
  );
}

function NumberField({ value, onChange, label, min, max }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} min={min} max={max}
        className="w-20 rounded-lg border border-border px-2 py-1 text-sm text-foreground text-right bg-surface" />
    </label>
  );
}

function TextField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <label className="block py-1">
      <span className="text-sm text-foreground">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border px-3 py-1.5 text-sm text-foreground bg-surface" />
    </label>
  );
}

function TextArea({ value, onChange, label, placeholder, rows }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; rows?: number }) {
  return (
    <label className="block py-1">
      <span className="text-sm text-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows ?? 3}
        className="mt-1 w-full rounded-lg border border-border px-3 py-1.5 text-sm text-foreground bg-surface resize-none" />
    </label>
  );
}

function SelectField({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { label: string; value: string }[] }) {
  return (
    <label className="flex items-center justify-between py-1">
      <span className="text-sm text-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border px-2 py-1 text-sm text-foreground bg-surface">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ListEditor({ items, onChange, label }: { items: string[]; onChange: (v: string[]) => void; label: string }) {
  const [newItem, setNewItem] = useState('');
  return (
    <div className="py-1">
      <span className="text-sm text-foreground">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground">
            {item}
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input type="text" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add..."
          className="flex-1 rounded-lg border border-border px-2 py-1 text-xs text-foreground bg-surface"
          onKeyDown={(e) => { if (e.key === 'Enter' && newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(''); } }} />
        <button type="button" onClick={() => { if (newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(''); } }}
          className="rounded-lg bg-indigo-500 px-2 py-1 text-xs text-white"><Plus className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen }: { title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border p-4 space-y-2">{children}</div>}
    </div>
  );
}

const MERGE_TAGS = ['{guest_name}', '{party_size}', '{position}', '{estimated_wait}', '{venue_name}', '{grace_period}', '{track_link}', '{cancel_link}'];

function TemplateEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="py-1">
      <span className="text-sm text-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        className="mt-1 w-full rounded-lg border border-border px-3 py-1.5 text-sm text-foreground bg-surface resize-none font-mono text-xs" />
      <div className="mt-1 flex flex-wrap gap-1">
        {MERGE_TAGS.map((tag) => (
          <button key={tag} type="button" onClick={() => onChange(value + tag)}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">{tag}</button>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function WaitlistConfigContent() {
  const { toast } = useToast();
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id ?? '';
  const [config, setConfig] = useState<WaitlistConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showQrFlyer, setShowQrFlyer] = useState(false);

  // Fetch config
  useEffect(() => {
    if (!locationId) return;
    fetch(`/api/v1/fnb/host/waitlist-config?locationId=${locationId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json?.data) setConfig(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [locationId]);

  // Save mutation
  const { mutate: save, isLoading: saving } = useMutation(async (data: WaitlistConfigData) => {
    const res = await fetch(`/api/v1/fnb/host/waitlist-config?locationId=${locationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: data.enabled,
        slugOverride: data.slugOverride,
        formConfig: data.formConfig,
        notificationConfig: data.notificationConfig,
        queueConfig: data.queueConfig,
        branding: data.branding,
        contentConfig: data.contentConfig,
        operatingHours: data.operatingHours,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.error?.message ?? 'Failed to save');
    }
    const json = await res.json();
    return json.data;
  });

  const handleSave = useCallback(async () => {
    if (!config) return;
    const result = await save(config);
    if (result) {
      setConfig(result);
      toast.success('Waitlist configuration saved');
    }
  }, [config, save, toast]);

  // Update helpers
  const update = useCallback(<K extends keyof WaitlistConfigData>(key: K, value: WaitlistConfigData[K]) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const updateForm = useCallback(<K extends keyof WaitlistConfigData['formConfig']>(key: K, value: WaitlistConfigData['formConfig'][K]) => {
    setConfig((prev) => prev ? { ...prev, formConfig: { ...prev.formConfig, [key]: value } } : prev);
  }, []);

  const updateNotif = useCallback(<K extends keyof WaitlistConfigData['notificationConfig']>(key: K, value: WaitlistConfigData['notificationConfig'][K]) => {
    setConfig((prev) => prev ? { ...prev, notificationConfig: { ...prev.notificationConfig, [key]: value } } : prev);
  }, []);

  const updateQueue = useCallback(<K extends keyof WaitlistConfigData['queueConfig']>(key: K, value: WaitlistConfigData['queueConfig'][K]) => {
    setConfig((prev) => prev ? { ...prev, queueConfig: { ...prev.queueConfig, [key]: value } } : prev);
  }, []);

  const updateBrand = useCallback(<K extends keyof WaitlistConfigData['branding']>(key: K, value: WaitlistConfigData['branding'][K]) => {
    setConfig((prev) => prev ? { ...prev, branding: { ...prev.branding, [key]: value } } : prev);
  }, []);

  const updateContent = useCallback(<K extends keyof WaitlistConfigData['contentConfig']>(key: K, value: WaitlistConfigData['contentConfig'][K]) => {
    setConfig((prev) => prev ? { ...prev, contentConfig: { ...prev.contentConfig, [key]: value } } : prev);
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Failed to load configuration. Please try again.</p>
      </div>
    );
  }

  const slug = config.slugOverride || 'your-venue';
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist/${slug}`;
  const embedCode = `<iframe src="${publicUrl}/embed" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;"></iframe>`;

  return (
    <div className="h-[calc(100vh-64px)] overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Waitlist Configuration</h1>
          <p className="text-xs text-muted-foreground">Configure your guest-facing waitlist experience</p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={config.enabled} onChange={(v) => update('enabled', v)} label="Enabled" />
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Config Sections */}
        <div className="lg:col-span-2 space-y-4">
          {/* General */}
          <Section title="General Settings" icon={Settings} defaultOpen>
            <TextField value={config.slugOverride ?? ''} onChange={(v) => update('slugOverride', v || null)} label="Vanity URL Slug" placeholder="joes-grill" />
            <p className="text-[10px] text-muted-foreground -mt-1">Lowercase letters, numbers, and hyphens only. This creates /waitlist/{slug}</p>
            <NumberField value={config.queueConfig.maxCapacity} onChange={(v) => updateQueue('maxCapacity', v)} label="Max queue capacity" min={1} max={500} />
            <SelectField value={config.queueConfig.estimationMethod} onChange={(v) => updateQueue('estimationMethod', v)} label="Wait time estimation"
              options={[{ label: 'Auto (calculated)', value: 'auto' }, { label: 'Manual (host enters)', value: 'manual' }]} />
            <Toggle checked={config.operatingHours.useBusinessHours} onChange={(v) => setConfig((prev) => prev ? { ...prev, operatingHours: { ...prev.operatingHours, useBusinessHours: v } } : prev)} label="Use business hours" />
          </Section>

          {/* Guest Form */}
          <Section title="Guest Form" icon={FileText}>
            <NumberField value={config.formConfig.minPartySize} onChange={(v) => updateForm('minPartySize', v)} label="Min party size" min={1} max={99} />
            <NumberField value={config.formConfig.maxPartySize} onChange={(v) => updateForm('maxPartySize', v)} label="Max party size" min={1} max={99} />
            <Toggle checked={config.formConfig.requirePhone} onChange={(v) => updateForm('requirePhone', v)} label="Require phone number" />
            <Toggle checked={config.formConfig.enableSeatingPreference} onChange={(v) => updateForm('enableSeatingPreference', v)} label="Enable seating preference" />
            {config.formConfig.enableSeatingPreference && (
              <ListEditor items={config.formConfig.seatingOptions} onChange={(v) => updateForm('seatingOptions', v)} label="Seating options" />
            )}
            <Toggle checked={config.formConfig.enableOccasion} onChange={(v) => updateForm('enableOccasion', v)} label="Enable occasion field" />
            {config.formConfig.enableOccasion && (
              <ListEditor items={config.formConfig.occasionOptions} onChange={(v) => updateForm('occasionOptions', v)} label="Occasion options" />
            )}
            <Toggle checked={config.formConfig.enableNotes} onChange={(v) => updateForm('enableNotes', v)} label="Enable notes field" />
            <TextArea value={config.formConfig.termsText ?? ''} onChange={(v) => updateForm('termsText', v || null)} label="Terms / disclaimer text" placeholder="By joining, you agree to..." rows={2} />
          </Section>

          {/* Notifications */}
          <Section title="Notifications" icon={Bell}>
            <TemplateEditor value={config.notificationConfig.confirmationTemplate} onChange={(v) => updateNotif('confirmationTemplate', v)} label="Confirmation SMS" />
            <TemplateEditor value={config.notificationConfig.readyTemplate} onChange={(v) => updateNotif('readyTemplate', v)} label="Table Ready SMS" />
            <TemplateEditor value={config.notificationConfig.cancellationTemplate} onChange={(v) => updateNotif('cancellationTemplate', v)} label="Cancellation SMS" />
            <NumberField value={config.notificationConfig.graceMinutes} onChange={(v) => updateNotif('graceMinutes', v)} label="Grace period (minutes)" min={3} max={60} />
            <Toggle checked={config.notificationConfig.autoRemoveAfterGrace} onChange={(v) => updateNotif('autoRemoveAfterGrace', v)} label="Auto-remove after grace period" />
            <Toggle checked={config.notificationConfig.reminderEnabled} onChange={(v) => updateNotif('reminderEnabled', v)} label="Send reminder SMS" />
            {config.notificationConfig.reminderEnabled && (
              <>
                <NumberField value={config.notificationConfig.reminderAfterMinutes} onChange={(v) => updateNotif('reminderAfterMinutes', v)} label="Reminder after (minutes)" min={5} max={120} />
                <TemplateEditor value={config.notificationConfig.reminderTemplate ?? ''} onChange={(v) => updateNotif('reminderTemplate', v || null)} label="Reminder SMS" />
              </>
            )}
          </Section>

          {/* Queue Management */}
          <Section title="Queue Management" icon={Users}>
            <Toggle checked={config.queueConfig.autoPromotionEnabled} onChange={(v) => updateQueue('autoPromotionEnabled', v)} label="Auto-promote when table frees" />
            <SelectField value={config.queueConfig.promotionLogic} onChange={(v) => updateQueue('promotionLogic', v)} label="Promotion logic"
              options={[{ label: 'First in line (FIFO)', value: 'first_in_line' }, { label: 'Best party size match', value: 'best_fit' }, { label: 'Priority first', value: 'priority_first' }]} />
            <ListEditor items={config.queueConfig.priorityLevels} onChange={(v) => updateQueue('priorityLevels', v)} label="Priority levels" />
            <Toggle checked={config.queueConfig.pacingEnabled} onChange={(v) => updateQueue('pacingEnabled', v)} label="Enable pacing limits" />
            {config.queueConfig.pacingEnabled && (
              <>
                <NumberField value={config.queueConfig.pacingMaxPerInterval} onChange={(v) => updateQueue('pacingMaxPerInterval', v)} label="Max entries per interval" min={1} max={100} />
                <NumberField value={config.queueConfig.pacingIntervalMinutes} onChange={(v) => updateQueue('pacingIntervalMinutes', v)} label="Interval (minutes)" min={5} max={120} />
              </>
            )}
            <Toggle checked={config.queueConfig.allowCheckWaitBeforeJoining} onChange={(v) => updateQueue('allowCheckWaitBeforeJoining', v)} label="Allow check wait before joining" />
          </Section>

          {/* Branding */}
          <Section title="Branding & Appearance" icon={Palette}>
            <TextField value={config.branding.logoUrl ?? ''} onChange={(v) => updateBrand('logoUrl', v || null)} label="Logo URL" placeholder="https://..." />
            <div className="grid grid-cols-3 gap-3 py-1">
              <label className="block">
                <span className="text-xs text-muted-foreground">Primary</span>
                <input type="color" value={config.branding.primaryColor} onChange={(e) => updateBrand('primaryColor', e.target.value)} className="mt-0.5 block w-full h-8 rounded cursor-pointer" />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Secondary</span>
                <input type="color" value={config.branding.secondaryColor} onChange={(e) => updateBrand('secondaryColor', e.target.value)} className="mt-0.5 block w-full h-8 rounded cursor-pointer" />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Accent</span>
                <input type="color" value={config.branding.accentColor} onChange={(e) => updateBrand('accentColor', e.target.value)} className="mt-0.5 block w-full h-8 rounded cursor-pointer" />
              </label>
            </div>
            <SelectField value={config.branding.fontFamily} onChange={(v) => updateBrand('fontFamily', v)} label="Font"
              options={[{ label: 'Inter', value: 'Inter' }, { label: 'Plus Jakarta Sans', value: 'Plus Jakarta Sans' }, { label: 'DM Sans', value: 'DM Sans' }, { label: 'Poppins', value: 'Poppins' }, { label: 'System', value: 'system-ui' }]} />
            <TextField value={config.branding.welcomeHeadline} onChange={(v) => updateBrand('welcomeHeadline', v)} label="Welcome headline" />
            <TextField value={config.branding.welcomeSubtitle} onChange={(v) => updateBrand('welcomeSubtitle', v)} label="Welcome subtitle" />
            <TextField value={config.branding.footerText ?? ''} onChange={(v) => updateBrand('footerText', v || null)} label="Footer text" />
          </Section>

          {/* Content */}
          <Section title="While You Wait" icon={Clock}>
            <Toggle checked={config.contentConfig.whileYouWaitEnabled} onChange={(v) => updateContent('whileYouWaitEnabled', v)} label='Enable "While You Wait" content' />
            {config.contentConfig.whileYouWaitEnabled && (
              <>
                <SelectField value={config.contentConfig.whileYouWaitType} onChange={(v) => updateContent('whileYouWaitType', v)} label="Content type"
                  options={[{ label: 'Text', value: 'text' }, { label: 'Menu Link', value: 'menu_link' }, { label: 'Specials', value: 'specials' }]} />
                {config.contentConfig.whileYouWaitType === 'text' ? (
                  <TextArea value={config.contentConfig.whileYouWaitContent ?? ''} onChange={(v) => updateContent('whileYouWaitContent', v || null)} label="Content" placeholder="Check out our specials..." />
                ) : (
                  <TextField value={config.contentConfig.whileYouWaitUrl ?? ''} onChange={(v) => updateContent('whileYouWaitUrl', v || null)} label="URL" placeholder="https://..." />
                )}
              </>
            )}
          </Section>
        </div>

        {/* Right Column: Share & Embed */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 space-y-4 sticky top-20">
            <h3 className="text-sm font-semibold text-foreground">Share & Embed</h3>

            {/* Direct Link */}
            <div>
              <span className="text-xs text-muted-foreground">Direct Link</span>
              <div className="mt-1 flex items-center gap-1.5">
                <code className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-xs text-foreground truncate">{publicUrl}</code>
                <button type="button" onClick={() => copyToClipboard(publicUrl)}
                  className="rounded-lg bg-muted p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Embed Code */}
            <div>
              <span className="text-xs text-muted-foreground">Embed Code</span>
              <div className="mt-1 relative">
                <code className="block rounded-lg bg-muted p-3 text-[10px] text-foreground font-mono break-all">{embedCode}</code>
                <button type="button" onClick={() => copyToClipboard(embedCode)}
                  className="absolute top-1.5 right-1.5 rounded bg-surface p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Preview */}
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors w-full">
              <ExternalLink className="h-3.5 w-3.5" /> Open Preview
            </a>

            {/* QR Flyer */}
            <button type="button" onClick={() => setShowQrFlyer(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-600 transition-colors w-full">
              <QrCode className="h-3.5 w-3.5" /> Download QR Flyer
            </button>

            {/* Color Preview */}
            <div>
              <span className="text-xs text-muted-foreground">Color Preview</span>
              <div className="mt-1 rounded-lg overflow-hidden">
                <div className="h-12 flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${config.branding.secondaryColor}, ${config.branding.primaryColor})` }}>
                  {config.branding.welcomeHeadline}
                </div>
                <div className="h-8 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: config.branding.accentColor }}>
                  Table Ready!
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Flyer Dialog */}
      <QrCodeDisplay
        open={showQrFlyer}
        onClose={() => setShowQrFlyer(false)}
        venueName={config.branding.welcomeHeadline || 'Our Restaurant'}
        slug={slug}
        branding={{
          logoUrl: config.branding.logoUrl,
          primaryColor: config.branding.primaryColor,
          secondaryColor: config.branding.secondaryColor,
          accentColor: config.branding.accentColor,
          fontFamily: config.branding.fontFamily,
          welcomeHeadline: config.branding.welcomeHeadline,
          footerText: config.branding.footerText,
        }}
      />
    </div>
  );
}
