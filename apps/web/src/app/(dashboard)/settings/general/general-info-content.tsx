'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Settings2,
  Globe,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  Check,
  ImagePlus,
  X,
  CircleAlert,
  Users,
  Shield,
  Blocks,
  ScrollText,
  LayoutDashboard,
} from 'lucide-react';
import { useBusinessInfo, useUpdateBusinessInfo, useContentBlocks, useUpdateContentBlock } from '@/hooks/use-business-info';
import dynamic from 'next/dynamic';
import { usePermissionsContext } from '@/components/permissions-provider';
import { TagInput } from '@/components/settings/general/tag-input';
import { BusinessHoursEditor } from '@/components/settings/general/business-hours-editor';
import { SocialLinksEditor } from '@/components/settings/general/social-links-editor';
import { RichTextEditor } from '@/components/settings/general/rich-text-editor';

// ── Lazy-loaded tabs (avoid pulling in the entire 1,355-line settings-content bundle) ──
const UserManagementTab = dynamic(() => import('../user-management-tab').then(m => ({ default: m.UserManagementTab })), { ssr: false, loading: () => <TabSkeleton /> });
const RolesTab = dynamic(() => import('../settings-content').then(m => ({ default: m.RolesTab })), { ssr: false, loading: () => <TabSkeleton /> });
const ModulesTab = dynamic(() => import('../settings-content').then(m => ({ default: m.ModulesTab })), { ssr: false, loading: () => <TabSkeleton /> });
const DashboardSettingsTab = dynamic(() => import('../settings-content').then(m => ({ default: m.DashboardSettingsTab })), { ssr: false, loading: () => <TabSkeleton /> });
const AuditLogTab = dynamic(() => import('../settings-content').then(m => ({ default: m.AuditLogTab })), { ssr: false, loading: () => <TabSkeleton /> });

function TabSkeleton() {
  return (
    <div className="space-y-4 py-4">
      <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
      <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
    </div>
  );
}
import type {
  UpdateBusinessInfoInput,
  ContentBlockKey,
  BusinessHours,
  SocialLinks,
} from '@oppsera/shared';
import {
  ACCESS_TYPES,
  RENTAL_TYPES,
  FNB_LEVELS,
  INDUSTRY_TYPES,
  CONTENT_BLOCK_KEYS,
} from '@oppsera/shared';

// ── Constants ────────────────────────────────────────────────────

const VERTICAL_SUGGESTIONS: Record<string, { services: string[]; products: string[] }> = {
  golf_club: {
    services: ['Tee Times', 'Lessons', 'Club Fitting', 'Tournaments', 'Practice Range', 'Club Rental'],
    products: ['Pro Shop', 'Apparel', 'Equipment', 'Gift Cards'],
  },
  restaurant: {
    services: ['Dine-in', 'Takeout', 'Delivery', 'Catering', 'Private Events', 'Happy Hour'],
    products: ['Gift Cards', 'Merchandise', 'Meal Kits'],
  },
  retail: {
    services: ['In-Store Shopping', 'Curbside Pickup', 'Online Orders', 'Personal Shopping', 'Gift Wrapping'],
    products: ['Gift Cards', 'Loyalty Rewards'],
  },
  hotel: {
    services: ['Room Reservations', 'Concierge', 'Room Service', 'Event Hosting', 'Spa'],
    products: ['Gift Cards', 'Merchandise', 'Packages'],
  },
  general: { services: [], products: [] },
};

const CONTENT_TAB_LABELS: Record<ContentBlockKey, { label: string; placeholder: string; maxLen: number }> = {
  about: { label: 'About', placeholder: 'Tell customers about your business, history, and mission...', maxLen: 5000 },
  services_events: { label: 'Services & Events', placeholder: 'Describe your services, upcoming events, and programs...', maxLen: 5000 },
  promotions: { label: 'Promotions', placeholder: 'Current deals, seasonal packages, and special offers...', maxLen: 3000 },
  team: { label: 'Team', placeholder: 'Introduce your staff, instructors, or leadership...', maxLen: 5000 },
};

// ── Label Helpers ────────────────────────────────────────────────

function toLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Collapsible Section ──────────────────────────────────────────

function Section({
  id,
  icon: Icon,
  title,
  defaultOpen = true,
  children,
  fieldCount,
  filledCount,
}: {
  id: string;
  icon: typeof Building2;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  fieldCount?: number;
  filledCount?: number;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    const saved = localStorage.getItem(`settings_general_${id}`);
    return saved !== null ? saved === 'true' : defaultOpen;
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(`settings_general_${id}`, String(next));
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-surface">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {fieldCount !== undefined && filledCount !== undefined && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {filledCount}/{fieldCount}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && <div className="border-t border-gray-100 px-5 pb-5 pt-4">{children}</div>}
    </div>
  );
}

// ── Field Wrapper ────────────────────────────────────────────────

function Field({
  label,
  required,
  helper,
  error,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {helper && !error && <p className="mt-1 text-xs text-gray-400">{helper}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
          <CircleAlert className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ── Input classes ────────────────────────────────────────────────

const INPUT = 'w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60';
const SELECT = 'w-full rounded-md border border-gray-300 bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60';

// ── Main Page (Tabbed) ────────────────────────────────────────────

type GeneralTab = 'business-info' | 'users' | 'roles' | 'modules' | 'dashboard' | 'audit';

export default function GeneralInfoContent() {
  const [activeTab, setActiveTab] = useState<GeneralTab>('business-info');
  const { can } = usePermissionsContext();

  const allTabs: { id: GeneralTab; label: string; icon: typeof Building2; requiredPermission: string }[] = [
    { id: 'business-info', label: 'Business Info', icon: Building2, requiredPermission: 'settings.view' },
    { id: 'users', label: 'Users', icon: Users, requiredPermission: 'users.view' },
    { id: 'roles', label: 'Roles', icon: Shield, requiredPermission: 'users.manage' },
    { id: 'modules', label: 'Modules', icon: Blocks, requiredPermission: 'modules.manage' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, requiredPermission: 'dashboard.configure' },
    { id: 'audit', label: 'Audit Log', icon: ScrollText, requiredPermission: 'audit.view' },
  ];

  const tabs = allTabs.filter((tab) => can(tab.requiredPermission));

  // Auto-select first visible tab if current tab is hidden
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0]!.id);
    }
  }, [tabs.length]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your business info, team, permissions, and modules</p>

      {/* Tab navigation */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'business-info' && <BusinessInfoTab />}
        {activeTab === 'users' && <UserManagementTab canManage={can('users.manage')} />}
        {activeTab === 'roles' && <RolesTab canManage={can('users.manage')} />}
        {activeTab === 'modules' && <ModulesTab />}
        {activeTab === 'dashboard' && <DashboardSettingsTab />}
        {activeTab === 'audit' && <AuditLogTab />}
      </div>
    </div>
  );
}

// ── Business Info Tab ────────────────────────────────────────────

function BusinessInfoTab() {
  const { data: info, isLoading: loadingInfo } = useBusinessInfo();
  const { data: blocks, isLoading: loadingBlocks } = useContentBlocks();
  const updateInfo = useUpdateBusinessInfo();
  const updateBlock = useUpdateContentBlock();
  const { can } = usePermissionsContext();
  const canEdit = can('settings.update');

  // ── Form state ─────────────────────────────────────────────────
  const [form, setForm] = useState<UpdateBusinessInfoInput>({});
  const [contentForms, setContentForms] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [contentDirty, setContentDirty] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeContentTab, setActiveContentTab] = useState<ContentBlockKey>('about');

  // Initialize form from loaded data
  useEffect(() => {
    if (info) {
      setForm({
        organizationName: info.organizationName ?? undefined,
        timezone: info.timezone ?? undefined,
        addressLine1: info.addressLine1,
        addressLine2: info.addressLine2,
        city: info.city,
        state: info.state,
        postalCode: info.postalCode,
        country: info.country ?? 'US',
        primaryPhone: info.primaryPhone,
        primaryEmail: info.primaryEmail,
        logoUrl: info.logoUrl,
        accessType: info.accessType as UpdateBusinessInfoInput['accessType'],
        servicesOffered: info.servicesOffered,
        productsOffered: info.productsOffered,
        rentalsAvailable: info.rentalsAvailable as UpdateBusinessInfoInput['rentalsAvailable'],
        foodAndBeverage: info.foodAndBeverage as UpdateBusinessInfoInput['foodAndBeverage'],
        promotionsDescription: info.promotionsDescription,
        customerAccessPolicy: info.customerAccessPolicy,
        websiteUrl: info.websiteUrl,
        bookingUrl: info.bookingUrl,
        portalUrl: info.portalUrl,
        socialLinks: info.socialLinks as SocialLinks,
        secondaryPhone: info.secondaryPhone,
        supportEmail: info.supportEmail,
        faxNumber: info.faxNumber,
        industryType: info.industryType as UpdateBusinessInfoInput['industryType'],
        businessHours: info.businessHours,
        yearEstablished: info.yearEstablished,
        photoGallery: info.photoGallery,
        promoVideoUrl: info.promoVideoUrl,
      });
    }
  }, [info]);

  useEffect(() => {
    if (blocks) {
      const map: Record<string, string> = {};
      for (const b of blocks) {
        map[b.blockKey] = b.content;
      }
      setContentForms(map);
    }
  }, [blocks]);

  // ── Helpers ────────────────────────────────────────────────────

  function updateField<K extends keyof UpdateBusinessInfoInput>(key: K, value: UpdateBusinessInfoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function updateContent(key: string, content: string) {
    setContentForms((prev) => ({ ...prev, [key]: content }));
    setContentDirty(true);
  }

  const suggestions = useMemo(() => {
    const vertical = form.industryType ?? info?.industryType ?? 'general';
    return VERTICAL_SUGGESTIONS[vertical] ?? VERTICAL_SUGGESTIONS.general!;
  }, [form.industryType, info?.industryType]);

  // ── Completeness calculation ──────────────────────────────────
  const completeness = useMemo(() => {
    const requiredFields = [
      form.organizationName, form.timezone, form.addressLine1,
      form.city, form.state, form.postalCode, form.primaryPhone, form.primaryEmail,
    ];
    const optionalFields = [
      form.logoUrl, form.accessType,
      (form.servicesOffered?.length ?? 0) > 0 ? 'yes' : null,
      form.websiteUrl,
      form.industryType,
    ];
    const filled = [...requiredFields, ...optionalFields].filter(Boolean).length;
    const total = requiredFields.length + optionalFields.length;
    return { filled, total, percent: Math.round((filled / total) * 100) };
  }, [form]);

  // ── Save ───────────────────────────────────────────────────────

  async function handleSave() {
    // Save business info
    if (dirty) {
      await updateInfo.mutateAsync(form);
    }
    // Save content blocks
    if (contentDirty) {
      for (const key of CONTENT_BLOCK_KEYS) {
        if (contentForms[key] !== undefined) {
          await updateBlock.mutateAsync({ blockKey: key, content: contentForms[key]! });
        }
      }
    }
    setDirty(false);
    setContentDirty(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  function handleDiscard() {
    if (info) {
      // Re-trigger initialization
      setForm({
        organizationName: info.organizationName ?? undefined,
        timezone: info.timezone ?? undefined,
        addressLine1: info.addressLine1,
        addressLine2: info.addressLine2,
        city: info.city,
        state: info.state,
        postalCode: info.postalCode,
        country: info.country ?? 'US',
        primaryPhone: info.primaryPhone,
        primaryEmail: info.primaryEmail,
        logoUrl: info.logoUrl,
        accessType: info.accessType as UpdateBusinessInfoInput['accessType'],
        servicesOffered: info.servicesOffered,
        productsOffered: info.productsOffered,
        rentalsAvailable: info.rentalsAvailable as UpdateBusinessInfoInput['rentalsAvailable'],
        foodAndBeverage: info.foodAndBeverage as UpdateBusinessInfoInput['foodAndBeverage'],
        promotionsDescription: info.promotionsDescription,
        customerAccessPolicy: info.customerAccessPolicy,
        websiteUrl: info.websiteUrl,
        bookingUrl: info.bookingUrl,
        portalUrl: info.portalUrl,
        socialLinks: info.socialLinks as SocialLinks,
        secondaryPhone: info.secondaryPhone,
        supportEmail: info.supportEmail,
        faxNumber: info.faxNumber,
        industryType: info.industryType as UpdateBusinessInfoInput['industryType'],
        businessHours: info.businessHours,
        yearEstablished: info.yearEstablished,
        photoGallery: info.photoGallery,
        promoVideoUrl: info.promoVideoUrl,
      });
    }
    if (blocks) {
      const map: Record<string, string> = {};
      for (const b of blocks) map[b.blockKey] = b.content;
      setContentForms(map);
    }
    setDirty(false);
    setContentDirty(false);
  }

  // ── Loading ────────────────────────────────────────────────────

  if (loadingInfo || loadingBlocks) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const isAnyDirty = dirty || contentDirty;
  const isSaving = updateInfo.isPending || updateBlock.isPending;
  const disabled = !canEdit;

  return (
    <div className="mx-auto max-w-[720px] space-y-6 pb-24">
      {/* Completeness bar */}
      <div className="rounded-lg border border-gray-200 bg-surface px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-gray-600">Profile completeness</span>
          <span className="text-sm font-medium text-gray-900">{completeness.percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${completeness.percent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-400">
          {completeness.filled}/{completeness.total} fields completed
          {completeness.percent === 100 && ' — Profile complete!'}
        </p>
      </div>

      {!canEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You don&apos;t have permission to edit business settings. Contact your administrator.
        </div>
      )}

      {/* ──────────── Section 1: Business Information ──────────── */}
      <Section
        id="business"
        icon={Building2}
        title="Business Information"
        fieldCount={10}
        filledCount={[
          form.organizationName, form.timezone, form.addressLine1, form.city,
          form.state, form.postalCode, form.primaryPhone, form.primaryEmail,
          form.logoUrl, form.addressLine2,
        ].filter(Boolean).length}
      >
        <div className="space-y-4">
          <Field label="Organization Name" required helper="Legal business name as registered">
            <input
              type="text"
              value={form.organizationName ?? ''}
              onChange={(e) => updateField('organizationName', e.target.value)}
              disabled={disabled}
              maxLength={120}
              className={INPUT}
            />
          </Field>

          <Field label="Timezone" required helper="Used for reporting, scheduling, and business date calculations">
            <input
              type="text"
              value={form.timezone ?? ''}
              onChange={(e) => updateField('timezone', e.target.value)}
              disabled={disabled}
              placeholder="America/New_York"
              list="timezone-list"
              className={INPUT}
            />
            <datalist id="timezone-list">
              {Intl.supportedValuesOf?.('timeZone')?.slice(0, 50).map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </Field>

          <Field label="Address Line 1" required helper="Street address">
            <input
              type="text"
              value={form.addressLine1 ?? ''}
              onChange={(e) => updateField('addressLine1', e.target.value)}
              disabled={disabled}
              className={INPUT}
            />
          </Field>

          <Field label="Address Line 2" helper="Suite, unit, floor, etc.">
            <input
              type="text"
              value={form.addressLine2 ?? ''}
              onChange={(e) => updateField('addressLine2', e.target.value)}
              disabled={disabled}
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="City" required>
              <input
                type="text"
                value={form.city ?? ''}
                onChange={(e) => updateField('city', e.target.value)}
                disabled={disabled}
                className={INPUT}
              />
            </Field>
            <Field label="State / Region" required>
              <input
                type="text"
                value={form.state ?? ''}
                onChange={(e) => updateField('state', e.target.value)}
                disabled={disabled}
                className={INPUT}
              />
            </Field>
            <Field label="Postal Code" required>
              <input
                type="text"
                value={form.postalCode ?? ''}
                onChange={(e) => updateField('postalCode', e.target.value)}
                disabled={disabled}
                className={INPUT}
              />
            </Field>
          </div>

          <Field label="Country" required>
            <select
              value={form.country ?? 'US'}
              onChange={(e) => updateField('country', e.target.value)}
              disabled={disabled}
              className={SELECT}
            >
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="GB">United Kingdom</option>
              <option value="AU">Australia</option>
              <option value="NZ">New Zealand</option>
              <option value="IE">Ireland</option>
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Primary Phone" required helper="Main contact number for customers">
              <input
                type="tel"
                value={form.primaryPhone ?? ''}
                onChange={(e) => updateField('primaryPhone', e.target.value)}
                disabled={disabled}
                placeholder="(555) 123-4567"
                className={INPUT}
              />
            </Field>
            <Field label="Primary Email" required helper="Appears on receipts and customer communications">
              <input
                type="email"
                value={form.primaryEmail ?? ''}
                onChange={(e) => updateField('primaryEmail', e.target.value)}
                disabled={disabled}
                placeholder="hello@yourbusiness.com"
                className={INPUT}
              />
            </Field>
          </div>

          {/* Logo Upload */}
          <Field label="Business Logo" helper="Recommended: 512x512px PNG or SVG. Max 2MB.">
            {form.logoUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={form.logoUrl}
                  alt="Business logo"
                  className="h-20 w-20 rounded-lg border border-gray-200 object-contain"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('logoUrl', null)}
                    disabled={disabled}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 hover:border-gray-400">
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">Drag & drop or click to upload</span>
                </div>
              </div>
            )}
          </Field>
        </div>
      </Section>

      {/* ──────────── Section 2: Operations ──────────── */}
      <Section id="operations" icon={Settings2} title="Operations">
        <div className="space-y-4">
          <Field label="Access Type" helper="How customers access your business">
            <select
              value={form.accessType ?? ''}
              onChange={(e) => updateField('accessType', e.target.value as typeof form.accessType)}
              disabled={disabled}
              className={SELECT}
            >
              <option value="">Select...</option>
              {ACCESS_TYPES.map((t) => (
                <option key={t} value={t}>{toLabel(t)}</option>
              ))}
            </select>
          </Field>

          <Field label="Services Offered" helper="Select all that apply. Type to add custom.">
            <TagInput
              value={form.servicesOffered ?? []}
              onChange={(tags) => updateField('servicesOffered', tags)}
              suggestions={suggestions.services}
              disabled={disabled}
            />
          </Field>

          <Field label="Products Offered" helper="General product categories you sell">
            <TagInput
              value={form.productsOffered ?? []}
              onChange={(tags) => updateField('productsOffered', tags)}
              suggestions={suggestions.products}
              disabled={disabled}
            />
          </Field>

          <Field label="Rentals Available" helper="Do you offer equipment, space, or vehicle rentals?">
            <select
              value={form.rentalsAvailable ?? ''}
              onChange={(e) => updateField('rentalsAvailable', e.target.value as typeof form.rentalsAvailable)}
              disabled={disabled}
              className={SELECT}
            >
              <option value="">Select...</option>
              {RENTAL_TYPES.map((t) => (
                <option key={t} value={t}>{toLabel(t)}</option>
              ))}
            </select>
          </Field>

          <Field label="Food & Beverage" helper="Level of F&B service at your location">
            <select
              value={form.foodAndBeverage ?? ''}
              onChange={(e) => updateField('foodAndBeverage', e.target.value as typeof form.foodAndBeverage)}
              disabled={disabled}
              className={SELECT}
            >
              <option value="">Select...</option>
              {FNB_LEVELS.map((t) => (
                <option key={t} value={t}>{toLabel(t)}</option>
              ))}
            </select>
          </Field>

          <Field label="Promotions Available" helper="Describe current offers, packages, or discounts">
            <textarea
              value={form.promotionsDescription ?? ''}
              onChange={(e) => updateField('promotionsDescription', e.target.value)}
              disabled={disabled}
              maxLength={500}
              rows={3}
              className={INPUT}
            />
          </Field>

          <Field label="Customer Access Policy" helper="Walk-in rules, reservation requirements, etc.">
            <textarea
              value={form.customerAccessPolicy ?? ''}
              onChange={(e) => updateField('customerAccessPolicy', e.target.value)}
              disabled={disabled}
              maxLength={500}
              rows={3}
              className={INPUT}
            />
          </Field>
        </div>
      </Section>

      {/* ──────────── Section 3: Online Presence ──────────── */}
      <Section id="online" icon={Globe} title="Online Presence">
        <div className="space-y-5">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Core Links</h4>
            <Field label="Website URL" helper="Your main business website">
              <input
                type="url"
                value={form.websiteUrl ?? ''}
                onChange={(e) => updateField('websiteUrl', e.target.value)}
                disabled={disabled}
                placeholder="https://www.yourbusiness.com"
                className={INPUT}
              />
            </Field>
            <Field label="Online Booking URL" helper="Where customers book appointments or tee times">
              <input
                type="url"
                value={form.bookingUrl ?? ''}
                onChange={(e) => updateField('bookingUrl', e.target.value)}
                disabled={disabled}
                placeholder="https://book.yourbusiness.com"
                className={INPUT}
              />
            </Field>
            <Field label="Customer Portal URL" helper="Client login page">
              <input
                type="url"
                value={form.portalUrl ?? ''}
                onChange={(e) => updateField('portalUrl', e.target.value)}
                disabled={disabled}
                placeholder="https://portal.yourbusiness.com"
                className={INPUT}
              />
            </Field>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <SocialLinksEditor
              value={(form.socialLinks as SocialLinks) ?? {}}
              onChange={(links) => updateField('socialLinks', links)}
              disabled={disabled}
            />
          </div>
        </div>
      </Section>

      {/* ──────────── Section 4: Content ──────────── */}
      <Section id="content" icon={FileText} title="Content">
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-gray-200">
            {CONTENT_BLOCK_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveContentTab(key)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  activeContentTab === key
                    ? 'border-b-2 border-indigo-500 text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {CONTENT_TAB_LABELS[key].label}
              </button>
            ))}
          </div>

          <RichTextEditor
            value={contentForms[activeContentTab] ?? ''}
            onChange={(html) => updateContent(activeContentTab, html)}
            maxLength={CONTENT_TAB_LABELS[activeContentTab].maxLen}
            placeholder={CONTENT_TAB_LABELS[activeContentTab].placeholder}
            disabled={disabled}
          />
        </div>
      </Section>

      {/* ──────────── Section 5: Advanced Business Details ──────────── */}
      <Section id="advanced" icon={Settings2} title="Advanced Business Details" defaultOpen={false}>
        <div className="space-y-6">
          {/* Contact Extensions */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Contact Extensions</h4>
            <Field label="Secondary Phone" helper="After-hours or department-specific line">
              <input
                type="tel"
                value={form.secondaryPhone ?? ''}
                onChange={(e) => updateField('secondaryPhone', e.target.value)}
                disabled={disabled}
                className={INPUT}
              />
            </Field>
            <Field label="Support Email" helper="Dedicated support inbox">
              <input
                type="email"
                value={form.supportEmail ?? ''}
                onChange={(e) => updateField('supportEmail', e.target.value)}
                disabled={disabled}
                className={INPUT}
              />
            </Field>
            <Field label="Fax Number" helper="If applicable">
              <input
                type="tel"
                value={form.faxNumber ?? ''}
                onChange={(e) => updateField('faxNumber', e.target.value)}
                disabled={disabled}
                className={INPUT}
              />
            </Field>
          </div>

          {/* Business Metadata */}
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-medium text-gray-700">Business Metadata</h4>

            <Field label="Industry Type" helper="Primary industry classification">
              <select
                value={form.industryType ?? ''}
                onChange={(e) => updateField('industryType', e.target.value as typeof form.industryType)}
                disabled={disabled}
                className={SELECT}
              >
                <option value="">Select...</option>
                {INDUSTRY_TYPES.map((t) => (
                  <option key={t} value={t}>{toLabel(t)}</option>
                ))}
              </select>
            </Field>

            <Field label="Business Hours" helper="Default hours for your primary location">
              <BusinessHoursEditor
                value={(form.businessHours as BusinessHours) ?? {}}
                onChange={(hours) => updateField('businessHours', hours)}
                disabled={disabled}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Year Established" helper="Shown on customer-facing pages">
                <input
                  type="number"
                  value={form.yearEstablished ?? ''}
                  onChange={(e) => updateField('yearEstablished', e.target.value ? Number(e.target.value) : null)}
                  disabled={disabled}
                  min={1800}
                  max={new Date().getFullYear()}
                  placeholder="2010"
                  className={INPUT}
                />
              </Field>
              <Field label="Tax ID / Registration Number" helper="EIN, VAT, or government registration number">
                <input
                  type="text"
                  value={form.taxId ?? (info?.taxIdMasked ?? '')}
                  onChange={(e) => updateField('taxId', e.target.value)}
                  disabled={disabled}
                  placeholder="XX-XXXXXXX"
                  className={INPUT}
                />
              </Field>
            </div>
          </div>

          {/* Media */}
          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-medium text-gray-700">Media</h4>

            <Field label="Photo Gallery" helper="Up to 20 photos. Used in portal and booking pages.">
              {(form.photoGallery?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {form.photoGallery?.map((photo, idx) => (
                    <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200">
                      <img src={photo.url} alt={photo.caption ?? ''} className="h-full w-full object-cover" />
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...(form.photoGallery ?? [])];
                            next.splice(idx, 1);
                            updateField('photoGallery', next);
                          }}
                          className="absolute right-1 top-1 hidden rounded-full bg-black/50 p-1 text-white group-hover:block"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {(form.photoGallery?.length ?? 0) < 20 && !disabled && (
                    <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/50 text-sm text-gray-400">
                  <ImagePlus className="mr-2 h-5 w-5" />
                  Add your first photo
                </div>
              )}
            </Field>

            <Field label="Promotional Video URL" helper="YouTube or Vimeo link">
              <input
                type="url"
                value={form.promoVideoUrl ?? ''}
                onChange={(e) => updateField('promoVideoUrl', e.target.value)}
                disabled={disabled}
                placeholder="https://youtube.com/watch?v=..."
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* ──────────── Sticky Save Bar ──────────── */}
      {isAnyDirty && canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-surface px-4 py-3 shadow-lg md:left-64">
          <div className="mx-auto flex max-w-[720px] items-center justify-between">
            <span className="text-sm text-gray-600">Unsaved changes</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isSaving}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100/60 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveSuccess ? (
                  <Check className="h-4 w-4" />
                ) : null}
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {saveSuccess && !isAnyDirty && (
        <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <Check className="h-4 w-4" />
          Business info updated
        </div>
      )}
    </div>
  );
}
