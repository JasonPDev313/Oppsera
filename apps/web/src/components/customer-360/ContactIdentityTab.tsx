'use client';

import { useState } from 'react';
import {
  Mail, Phone, MapPin, ShieldAlert, Star, CheckCircle,
  MessageSquare, FileText, Megaphone, Plus, Pencil, Trash2,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import {
  useCustomerContacts360,
  useCustomerEmailMutations,
  useCustomerPhoneMutations,
  useCustomerAddressMutations,
  useEmergencyContactMutations,
} from '@/hooks/use-customer-360';
import type {
  CustomerEmailEntry,
  CustomerPhoneEntry,
  CustomerAddressEntry,
  EmergencyContactEntry,
  AddEmailInput,
  UpdateEmailInput,
  AddPhoneInput,
  UpdatePhoneInput,
  AddAddressInput,
  UpdateAddressInput,
  AddEmergencyContactInput,
  UpdateEmergencyContactInput,
} from '@/types/customer-360';

// ── Constants ───────────────────────────────────────────────────

const EMAIL_TYPES = ['personal', 'billing', 'spouse', 'corporate', 'other'];
const PHONE_TYPES = ['mobile', 'home', 'work', 'sms', 'other'];
const ADDRESS_TYPES = ['mailing', 'billing', 'home', 'work', 'seasonal', 'other'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Helpers ─────────────────────────────────────────────────────

function formatPhone(e164: string, display: string | null): string {
  if (display) return display;
  const digits = e164.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return e164;
}

function formatAddress(a: CustomerAddressEntry): string {
  const parts = [a.line1, a.line2, a.line3].filter(Boolean);
  const cityLine = [a.city, a.state].filter(Boolean).join(', ');
  if (a.postalCode) parts.push(`${cityLine} ${a.postalCode}`);
  else parts.push(cityLine);
  if (a.country && a.country !== 'US' && a.country !== 'USA') parts.push(a.country);
  return parts.join(', ');
}

function typeBadgeVariant(type: string): string {
  const map: Record<string, string> = {
    personal: 'info', mobile: 'info', home: 'info', mailing: 'info',
    billing: 'warning', work: 'purple', corporate: 'purple',
    spouse: 'orange', sms: 'indigo', seasonal: 'orange',
  };
  return map[type] ?? 'neutral';
}

// ── Shared sub-components ───────────────────────────────────────

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Badge variant="neutral">{count}</Badge>
    </div>
  );
}

function InlineSelect({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: string[]; label: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function InlineInput({ value, onChange, label, placeholder, type = 'text', required }: {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string;
  type?: string; required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}{required && <span className="text-red-500"> *</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
        required={required}
      />
    </label>
  );
}

function InlineCheckbox({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-input"
      />
      {label}
    </label>
  );
}

function ActionButton({ onClick, icon: Icon, label, variant = 'default' }: {
  onClick: () => void; icon: React.ElementType; label: string;
  variant?: 'default' | 'danger';
}) {
  const cls = variant === 'danger'
    ? 'text-red-500 hover:bg-red-500/10'
    : 'text-muted-foreground hover:bg-accent/50';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1 rounded ${cls}`}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function SaveCancelButtons({ onSave, onCancel, saving }: {
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="rounded border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Email Section ───────────────────────────────────────────────

function EmailSection({ customerId, emails, onRefresh }: {
  customerId: string; emails: CustomerEmailEntry[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const mutations = useCustomerEmailMutations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddEmailInput>({
    email: '', type: 'personal', isPrimary: false,
    canReceiveStatements: true, canReceiveMarketing: false,
  });
  const [editForm, setEditForm] = useState<UpdateEmailInput>({});

  function resetForm() {
    setForm({ email: '', type: 'personal', isPrimary: false, canReceiveStatements: true, canReceiveMarketing: false });
  }

  async function handleAdd() {
    if (!form.email.trim()) return;
    try {
      await mutations.addEmail(customerId, form);
      toast.success('Email added');
      resetForm();
      setShowAdd(false);
      onRefresh();
    } catch {
      toast.error('Failed to add email');
    }
  }

  async function handleUpdate(emailId: string) {
    try {
      await mutations.updateEmail(customerId, emailId, editForm);
      toast.success('Email updated');
      setEditingId(null);
      onRefresh();
    } catch {
      toast.error('Failed to update email');
    }
  }

  async function handleRemove(emailId: string) {
    if (!window.confirm('Remove this email?')) return;
    try {
      await mutations.removeEmail(customerId, emailId);
      toast.success('Email removed');
      onRefresh();
    } catch {
      toast.error('Failed to remove email');
    }
  }

  function startEdit(entry: CustomerEmailEntry) {
    setEditingId(entry.id);
    setEditForm({
      type: entry.type,
      isPrimary: entry.isPrimary,
      canReceiveStatements: entry.canReceiveStatements,
      canReceiveMarketing: entry.canReceiveMarketing,
    });
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <SectionHeader icon={Mail} title="Emails" count={emails.length} />

      <div className="space-y-2">
        {emails.map((entry) =>
          editingId === entry.id ? (
            <div key={entry.id} className="rounded border border-indigo-500/30 bg-indigo-500/10 p-3 space-y-3">
              <p className="text-sm font-medium text-foreground">{entry.email}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InlineSelect
                  value={editForm.type ?? entry.type}
                  onChange={(v) => setEditForm((p) => ({ ...p, type: v }))}
                  options={EMAIL_TYPES}
                  label="Type"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <InlineCheckbox
                  checked={editForm.isPrimary ?? entry.isPrimary}
                  onChange={(v) => setEditForm((p) => ({ ...p, isPrimary: v }))}
                  label="Primary"
                />
                <InlineCheckbox
                  checked={editForm.canReceiveStatements ?? entry.canReceiveStatements}
                  onChange={(v) => setEditForm((p) => ({ ...p, canReceiveStatements: v }))}
                  label="Statements"
                />
                <InlineCheckbox
                  checked={editForm.canReceiveMarketing ?? entry.canReceiveMarketing}
                  onChange={(v) => setEditForm((p) => ({ ...p, canReceiveMarketing: v }))}
                  label="Marketing"
                />
              </div>
              <SaveCancelButtons
                onSave={() => handleUpdate(entry.id)}
                onCancel={() => setEditingId(null)}
                saving={mutations.isLoading}
              />
            </div>
          ) : (
            <div key={entry.id} className="flex items-center gap-2 rounded p-2 hover:bg-accent group">
              <span className="text-sm text-foreground font-medium">{entry.email}</span>
              <Badge variant={typeBadgeVariant(entry.type)}>{entry.type}</Badge>
              {entry.isPrimary && <Star aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
              {entry.isVerified && <CheckCircle aria-hidden="true" className="h-3.5 w-3.5 text-green-500" />}
              {entry.canReceiveStatements && (
                <span title="Statements"><FileText aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" /></span>
              )}
              {entry.canReceiveMarketing && (
                <span title="Marketing"><Megaphone aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" /></span>
              )}
              <span className="flex-1" />
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ActionButton icon={Pencil} label="Edit" onClick={() => startEdit(entry)} />
                <ActionButton icon={Trash2} label="Remove" variant="danger" onClick={() => handleRemove(entry.id)} />
              </div>
            </div>
          ),
        )}
      </div>

      {showAdd ? (
        <div className="mt-3 rounded border border-border bg-surface p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InlineInput
              value={form.email}
              onChange={(v) => setForm((p) => ({ ...p, email: v }))}
              label="Email"
              placeholder="user@example.com"
              type="email"
              required
            />
            <InlineSelect
              value={form.type}
              onChange={(v) => setForm((p) => ({ ...p, type: v }))}
              options={EMAIL_TYPES}
              label="Type"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <InlineCheckbox
              checked={form.isPrimary ?? false}
              onChange={(v) => setForm((p) => ({ ...p, isPrimary: v }))}
              label="Primary"
            />
            <InlineCheckbox
              checked={form.canReceiveStatements ?? true}
              onChange={(v) => setForm((p) => ({ ...p, canReceiveStatements: v }))}
              label="Statements"
            />
            <InlineCheckbox
              checked={form.canReceiveMarketing ?? false}
              onChange={(v) => setForm((p) => ({ ...p, canReceiveMarketing: v }))}
              label="Marketing"
            />
          </div>
          <SaveCancelButtons
            onSave={handleAdd}
            onCancel={() => { setShowAdd(false); resetForm(); }}
            saving={mutations.isLoading}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Add Email
        </button>
      )}
    </div>
  );
}

// ── Phone Section ───────────────────────────────────────────────

function PhoneSection({ customerId, phones, onRefresh }: {
  customerId: string; phones: CustomerPhoneEntry[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const mutations = useCustomerPhoneMutations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddPhoneInput>({
    phoneE164: '', type: 'mobile', isPrimary: false, canReceiveSms: false,
  });
  const [editForm, setEditForm] = useState<UpdatePhoneInput>({});

  function resetForm() {
    setForm({ phoneE164: '', type: 'mobile', isPrimary: false, canReceiveSms: false });
  }

  async function handleAdd() {
    if (!form.phoneE164.trim()) return;
    try {
      await mutations.addPhone(customerId, form);
      toast.success('Phone added');
      resetForm();
      setShowAdd(false);
      onRefresh();
    } catch {
      toast.error('Failed to add phone');
    }
  }

  async function handleUpdate(phoneId: string) {
    try {
      await mutations.updatePhone(customerId, phoneId, editForm);
      toast.success('Phone updated');
      setEditingId(null);
      onRefresh();
    } catch {
      toast.error('Failed to update phone');
    }
  }

  async function handleRemove(phoneId: string) {
    if (!window.confirm('Remove this phone number?')) return;
    try {
      await mutations.removePhone(customerId, phoneId);
      toast.success('Phone removed');
      onRefresh();
    } catch {
      toast.error('Failed to remove phone');
    }
  }

  function startEdit(entry: CustomerPhoneEntry) {
    setEditingId(entry.id);
    setEditForm({ type: entry.type, isPrimary: entry.isPrimary, canReceiveSms: entry.canReceiveSms });
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <SectionHeader icon={Phone} title="Phones" count={phones.length} />

      <div className="space-y-2">
        {phones.map((entry) =>
          editingId === entry.id ? (
            <div key={entry.id} className="rounded border border-indigo-500/30 bg-indigo-500/10 p-3 space-y-3">
              <p className="text-sm font-medium text-foreground">{formatPhone(entry.phoneE164, entry.phoneDisplay)}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InlineSelect
                  value={editForm.type ?? entry.type}
                  onChange={(v) => setEditForm((p) => ({ ...p, type: v }))}
                  options={PHONE_TYPES}
                  label="Type"
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <InlineCheckbox
                  checked={editForm.isPrimary ?? entry.isPrimary}
                  onChange={(v) => setEditForm((p) => ({ ...p, isPrimary: v }))}
                  label="Primary"
                />
                <InlineCheckbox
                  checked={editForm.canReceiveSms ?? entry.canReceiveSms}
                  onChange={(v) => setEditForm((p) => ({ ...p, canReceiveSms: v }))}
                  label="Can receive SMS"
                />
              </div>
              <SaveCancelButtons
                onSave={() => handleUpdate(entry.id)}
                onCancel={() => setEditingId(null)}
                saving={mutations.isLoading}
              />
            </div>
          ) : (
            <div key={entry.id} className="flex items-center gap-2 rounded p-2 hover:bg-accent group">
              <span className="text-sm text-foreground font-medium">
                {formatPhone(entry.phoneE164, entry.phoneDisplay)}
              </span>
              <Badge variant={typeBadgeVariant(entry.type)}>{entry.type}</Badge>
              {entry.isPrimary && <Star aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
              {entry.isVerified && <CheckCircle aria-hidden="true" className="h-3.5 w-3.5 text-green-500" />}
              {entry.canReceiveSms && (
                <span title="SMS capable"><MessageSquare aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" /></span>
              )}
              <span className="flex-1" />
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ActionButton icon={Pencil} label="Edit" onClick={() => startEdit(entry)} />
                <ActionButton icon={Trash2} label="Remove" variant="danger" onClick={() => handleRemove(entry.id)} />
              </div>
            </div>
          ),
        )}
      </div>

      {showAdd ? (
        <div className="mt-3 rounded border border-border bg-surface p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InlineInput
              value={form.phoneE164}
              onChange={(v) => setForm((p) => ({ ...p, phoneE164: v }))}
              label="Phone"
              placeholder="+15551234567"
              type="tel"
              required
            />
            <InlineSelect
              value={form.type}
              onChange={(v) => setForm((p) => ({ ...p, type: v }))}
              options={PHONE_TYPES}
              label="Type"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <InlineCheckbox
              checked={form.isPrimary ?? false}
              onChange={(v) => setForm((p) => ({ ...p, isPrimary: v }))}
              label="Primary"
            />
            <InlineCheckbox
              checked={form.canReceiveSms ?? false}
              onChange={(v) => setForm((p) => ({ ...p, canReceiveSms: v }))}
              label="Can receive SMS"
            />
          </div>
          <SaveCancelButtons
            onSave={handleAdd}
            onCancel={() => { setShowAdd(false); resetForm(); }}
            saving={mutations.isLoading}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Add Phone
        </button>
      )}
    </div>
  );
}

// ── Address Section ─────────────────────────────────────────────

const EMPTY_ADDRESS: AddAddressInput = {
  type: 'mailing', line1: '', city: '', country: 'US',
  label: '', line2: '', line3: '', state: '', postalCode: '', county: '',
  isPrimary: false, seasonalStartMonth: undefined, seasonalEndMonth: undefined,
};

function AddressSection({ customerId, addresses, onRefresh }: {
  customerId: string; addresses: CustomerAddressEntry[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const mutations = useCustomerAddressMutations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddAddressInput>({ ...EMPTY_ADDRESS });
  const [editForm, setEditForm] = useState<UpdateAddressInput>({});

  async function handleAdd() {
    if (!form.line1.trim() || !form.city.trim()) return;
    try {
      await mutations.addAddress(customerId, form);
      toast.success('Address added');
      setForm({ ...EMPTY_ADDRESS });
      setShowAdd(false);
      onRefresh();
    } catch {
      toast.error('Failed to add address');
    }
  }

  async function handleUpdate(addressId: string) {
    try {
      await mutations.updateAddress(customerId, addressId, editForm);
      toast.success('Address updated');
      setEditingId(null);
      onRefresh();
    } catch {
      toast.error('Failed to update address');
    }
  }

  async function handleRemove(addressId: string) {
    if (!window.confirm('Remove this address?')) return;
    try {
      await mutations.removeAddress(customerId, addressId);
      toast.success('Address removed');
      onRefresh();
    } catch {
      toast.error('Failed to remove address');
    }
  }

  function startEdit(entry: CustomerAddressEntry) {
    setEditingId(entry.id);
    setEditForm({
      type: entry.type,
      label: entry.label ?? '',
      line1: entry.line1,
      line2: entry.line2 ?? '',
      line3: entry.line3 ?? '',
      city: entry.city,
      state: entry.state ?? '',
      postalCode: entry.postalCode ?? '',
      county: entry.county ?? '',
      country: entry.country,
      isPrimary: entry.isPrimary,
      seasonalStartMonth: entry.seasonalStartMonth,
      seasonalEndMonth: entry.seasonalEndMonth,
    });
  }

  function renderAddressForm(
    data: AddAddressInput | UpdateAddressInput,
    update: (patch: Partial<AddAddressInput & UpdateAddressInput>) => void,
  ) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InlineSelect
            value={(data.type as string) ?? 'mailing'}
            onChange={(v) => update({ type: v })}
            options={ADDRESS_TYPES}
            label="Type"
          />
          <InlineInput
            value={(data.label as string) ?? ''}
            onChange={(v) => update({ label: v })}
            label="Label"
            placeholder="e.g. Lake House"
          />
          <InlineInput
            value={(data.country as string) ?? 'US'}
            onChange={(v) => update({ country: v })}
            label="Country"
          />
        </div>
        <InlineInput
          value={(data.line1 as string) ?? ''}
          onChange={(v) => update({ line1: v })}
          label="Address Line 1"
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InlineInput
            value={(data.line2 as string) ?? ''}
            onChange={(v) => update({ line2: v })}
            label="Address Line 2"
          />
          <InlineInput
            value={(data.line3 as string) ?? ''}
            onChange={(v) => update({ line3: v })}
            label="Address Line 3"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InlineInput
            value={(data.city as string) ?? ''}
            onChange={(v) => update({ city: v })}
            label="City"
            required
          />
          <InlineInput
            value={(data.state as string) ?? ''}
            onChange={(v) => update({ state: v })}
            label="State"
          />
          <InlineInput
            value={(data.postalCode as string) ?? ''}
            onChange={(v) => update({ postalCode: v })}
            label="Postal Code"
          />
          <InlineInput
            value={(data.county as string) ?? ''}
            onChange={(v) => update({ county: v })}
            label="County"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <InlineCheckbox
            checked={(data.isPrimary as boolean) ?? false}
            onChange={(v) => update({ isPrimary: v })}
            label="Primary"
          />
        </div>
        {((data.type as string) === 'seasonal' || data.seasonalStartMonth != null) && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Seasonal Start
              <select
                value={data.seasonalStartMonth ?? ''}
                onChange={(e) => update({ seasonalStartMonth: e.target.value ? Number(e.target.value) : undefined })}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Seasonal End
              <select
                value={data.seasonalEndMonth ?? ''}
                onChange={(e) => update({ seasonalEndMonth: e.target.value ? Number(e.target.value) : undefined })}
                className="rounded border border-input bg-surface px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <SectionHeader icon={MapPin} title="Addresses" count={addresses.length} />

      <div className="space-y-2">
        {addresses.map((entry) =>
          editingId === entry.id ? (
            <div key={entry.id} className="rounded border border-indigo-500/30 bg-indigo-500/10 p-3 space-y-3">
              {renderAddressForm(editForm, (patch) => setEditForm((p) => ({ ...p, ...patch })))}
              <SaveCancelButtons
                onSave={() => handleUpdate(entry.id)}
                onCancel={() => setEditingId(null)}
                saving={mutations.isLoading}
              />
            </div>
          ) : (
            <div key={entry.id} className="flex items-start gap-2 rounded p-2 hover:bg-accent group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-foreground">{formatAddress(entry)}</span>
                  <Badge variant={typeBadgeVariant(entry.type)}>{entry.type}</Badge>
                  {entry.isPrimary && <Star aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  {entry.label && (
                    <span className="text-xs text-muted-foreground italic">{entry.label}</span>
                  )}
                </div>
                {entry.seasonalStartMonth != null && entry.seasonalEndMonth != null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Seasonal: {MONTH_NAMES[entry.seasonalStartMonth - 1]}&ndash;{MONTH_NAMES[entry.seasonalEndMonth - 1]}
                  </p>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <ActionButton icon={Pencil} label="Edit" onClick={() => startEdit(entry)} />
                <ActionButton icon={Trash2} label="Remove" variant="danger" onClick={() => handleRemove(entry.id)} />
              </div>
            </div>
          ),
        )}
      </div>

      {showAdd ? (
        <div className="mt-3 rounded border border-border bg-surface p-3 space-y-3">
          {renderAddressForm(form, (patch) => setForm((p) => ({ ...p, ...patch })))}
          <SaveCancelButtons
            onSave={handleAdd}
            onCancel={() => { setShowAdd(false); setForm({ ...EMPTY_ADDRESS }); }}
            saving={mutations.isLoading}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          <Plus className="h-3.5 w-3.5" /> Add Address
        </button>
      )}
    </div>
  );
}

// ── Emergency Contacts Section ──────────────────────────────────

const EMPTY_EMERGENCY: AddEmergencyContactInput = {
  name: '', phoneE164: '', relationship: '', email: '', notes: '', isPrimary: false,
};

function EmergencyContactsSection({ customerId, contacts, onRefresh }: {
  customerId: string; contacts: EmergencyContactEntry[]; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const mutations = useEmergencyContactMutations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddEmergencyContactInput>({ ...EMPTY_EMERGENCY });
  const [editForm, setEditForm] = useState<UpdateEmergencyContactInput>({});

  async function handleAdd() {
    if (!form.name.trim() || !form.phoneE164.trim()) return;
    try {
      await mutations.addEmergencyContact(customerId, form);
      toast.success('Emergency contact added');
      setForm({ ...EMPTY_EMERGENCY });
      setShowAdd(false);
      onRefresh();
    } catch {
      toast.error('Failed to add emergency contact');
    }
  }

  async function handleUpdate(contactId: string) {
    try {
      await mutations.updateEmergencyContact(customerId, contactId, editForm);
      toast.success('Emergency contact updated');
      setEditingId(null);
      onRefresh();
    } catch {
      toast.error('Failed to update emergency contact');
    }
  }

  async function handleRemove(contactId: string) {
    if (!window.confirm('Remove this emergency contact?')) return;
    try {
      await mutations.removeEmergencyContact(customerId, contactId);
      toast.success('Emergency contact removed');
      onRefresh();
    } catch {
      toast.error('Failed to remove emergency contact');
    }
  }

  function startEdit(entry: EmergencyContactEntry) {
    setEditingId(entry.id);
    setEditForm({
      name: entry.name,
      relationship: entry.relationship ?? '',
      phoneE164: entry.phoneE164,
      email: entry.email ?? '',
      notes: entry.notes ?? '',
      isPrimary: entry.isPrimary,
    });
  }

  function renderEmergencyForm(
    data: AddEmergencyContactInput | UpdateEmergencyContactInput,
    update: (patch: Partial<AddEmergencyContactInput & UpdateEmergencyContactInput>) => void,
  ) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InlineInput
            value={(data.name as string) ?? ''}
            onChange={(v) => update({ name: v })}
            label="Name"
            required
          />
          <InlineInput
            value={(data.relationship as string) ?? ''}
            onChange={(v) => update({ relationship: v })}
            label="Relationship"
            placeholder="e.g. Spouse, Parent"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InlineInput
            value={(data.phoneE164 as string) ?? ''}
            onChange={(v) => update({ phoneE164: v })}
            label="Phone"
            placeholder="+15551234567"
            type="tel"
            required
          />
          <InlineInput
            value={(data.email as string) ?? ''}
            onChange={(v) => update({ email: v })}
            label="Email"
            type="email"
          />
        </div>
        <InlineInput
          value={(data.notes as string) ?? ''}
          onChange={(v) => update({ notes: v })}
          label="Notes"
        />
        <InlineCheckbox
          checked={(data.isPrimary as boolean) ?? false}
          onChange={(v) => update({ isPrimary: v })}
          label="Primary emergency contact"
        />
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <SectionHeader icon={ShieldAlert} title="Emergency Contacts" count={contacts.length} />

      <div className="space-y-2">
        {contacts.map((entry) =>
          editingId === entry.id ? (
            <div key={entry.id} className="rounded border border-indigo-500/30 bg-indigo-500/10 p-3 space-y-3">
              {renderEmergencyForm(editForm, (patch) => setEditForm((p) => ({ ...p, ...patch })))}
              <SaveCancelButtons
                onSave={() => handleUpdate(entry.id)}
                onCancel={() => setEditingId(null)}
                saving={mutations.isLoading}
              />
            </div>
          ) : (
            <div key={entry.id} className="flex items-start gap-2 rounded p-2 hover:bg-accent group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{entry.name}</span>
                  {entry.relationship && (
                    <Badge variant="neutral">{entry.relationship}</Badge>
                  )}
                  {entry.isPrimary && <Star aria-hidden="true" className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span>{formatPhone(entry.phoneE164, entry.phoneDisplay)}</span>
                  {entry.email && <span>{entry.email}</span>}
                </div>
                {entry.notes && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">{entry.notes}</p>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <ActionButton icon={Pencil} label="Edit" onClick={() => startEdit(entry)} />
                <ActionButton icon={Trash2} label="Remove" variant="danger" onClick={() => handleRemove(entry.id)} />
              </div>
            </div>
          ),
        )}
      </div>

      {showAdd ? (
        <div className="mt-3 rounded border border-border bg-surface p-3 space-y-3">
          {renderEmergencyForm(form, (patch) => setForm((p) => ({ ...p, ...patch })))}
          <SaveCancelButtons
            onSave={handleAdd}
            onCancel={() => { setShowAdd(false); setForm({ ...EMPTY_EMERGENCY }); }}
            saving={mutations.isLoading}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" /> Add Emergency Contact
        </button>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function ContactIdentityTab({ customerId }: { customerId: string }) {
  const contacts = useCustomerContacts360(customerId);

  if (contacts.isLoading && !contacts.data) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border border-border rounded-lg p-4 h-24 bg-muted" />
        ))}
      </div>
    );
  }

  if (contacts.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
        Failed to load contact information. Please try again.
      </div>
    );
  }

  const data = contacts.data;

  return (
    <div className="space-y-4">
      {/* Identity Card */}
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <User aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Identity</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Basic identity is displayed in the profile header above. Use the sections below to manage detailed contact information.
        </p>
      </div>

      {/* Emails */}
      <EmailSection
        customerId={customerId}
        emails={data?.emails ?? []}
        onRefresh={contacts.mutate}
      />

      {/* Phones */}
      <PhoneSection
        customerId={customerId}
        phones={data?.phones ?? []}
        onRefresh={contacts.mutate}
      />

      {/* Addresses */}
      <AddressSection
        customerId={customerId}
        addresses={data?.addresses ?? []}
        onRefresh={contacts.mutate}
      />

      {/* Emergency Contacts */}
      <EmergencyContactsSection
        customerId={customerId}
        contacts={data?.emergencyContacts ?? []}
        onRefresh={contacts.mutate}
      />
    </div>
  );
}
