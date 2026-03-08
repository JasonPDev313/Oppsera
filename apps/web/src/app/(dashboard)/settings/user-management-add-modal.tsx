'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface Props {
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

interface AddForm {
  firstName: string;
  lastName: string;
  emailAddress: string;
  userName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  userRole: string;
  userStatus: 'active' | 'inactive';
  posOverridePin: string;
  uniqueIdentificationPin: string;
  userTabColor: string;
  externalPayrollEmployeeId: string;
  forcePasswordReset: boolean;
  locationIds: string[];
}

const emptyForm: AddForm = {
  firstName: '', lastName: '', emailAddress: '', userName: '',
  password: '', confirmPassword: '', phoneNumber: '', userRole: '',
  userStatus: 'active', posOverridePin: '', uniqueIdentificationPin: '',
  userTabColor: '#4f46e5', externalPayrollEmployeeId: '',
  forcePasswordReset: false, locationIds: [],
};

export default function AddUserModal({ roles, locations, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AddForm>(emptyForm);
  const [showPasswords, setShowPasswords] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const WEAK_4 = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1212','2121','1122','2211','0123','3210','9876','6789','1010','2020','6969','1357','2468']);
  const pinError = useMemo(() => {
    const pin = form.posOverridePin;
    if (pin && !/^\d{4,8}$/.test(pin)) return 'Override PIN must be 4–8 digits';
    if (pin && pin.length === 4 && WEAK_4.has(pin)) return 'Override PIN is too easy to guess — avoid common patterns';
    const idPin = form.uniqueIdentificationPin;
    if (idPin && !/^\d{4}$/.test(idPin)) return 'Unique ID PIN must be exactly 4 digits';
    if (idPin && WEAK_4.has(idPin)) return 'Unique ID PIN is too easy to guess — avoid common patterns';
    if (pin && idPin && pin === idPin) return 'Override PIN must differ from Unique ID PIN';
    if (pin && idPin && pin.startsWith(idPin)) return 'Override PIN cannot start with your Unique ID PIN — this causes conflicts when verifying';
    return '';
  }, [form.posOverridePin, form.uniqueIdentificationPin]);

  const canSubmit = useMemo(() => {
    if (!form.firstName || !form.lastName || !form.emailAddress || !form.userName || !form.userRole) return false;
    if (form.password && form.password !== form.confirmPassword) return false;
    if (pinError) return false;
    return true;
  }, [form, pinError]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await apiFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          password: form.password || undefined,
          posOverridePin: form.posOverridePin || undefined,
          uniqueIdentificationPin: form.uniqueIdentificationPin || undefined,
          externalPayrollEmployeeId: form.externalPayrollEmployeeId || undefined,
        }),
      });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.details?.length ? error.details.map((d) => d.message).join('. ') : error.message);
      }
    } finally {
      setSaving(false);
    }
  }, [form, canSubmit, onSaved, toast]);

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Add New User</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input placeholder="First Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
          <input placeholder="Last Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
          <input placeholder="Email Address" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.emailAddress} onChange={(e) => setForm((p) => ({ ...p, emailAddress: e.target.value }))} />
          <input placeholder="User Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.userName} onChange={(e) => setForm((p) => ({ ...p, userName: e.target.value }))} />
          <input type={showPasswords ? 'text' : 'password'} placeholder="Password (optional)" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <input type={showPasswords ? 'text' : 'password'} placeholder="Confirm Password" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.confirmPassword} onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
          <input placeholder="Phone Number" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
          <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.userRole} onChange={(e) => setForm((p) => ({ ...p, userRole: e.target.value }))}>
            <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Role</option>
            {roles.map((r) => <option key={r.id} value={r.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{r.name}</option>)}
          </select>
          <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.userStatus} onChange={(e) => setForm((p) => ({ ...p, userStatus: e.target.value as 'active' | 'inactive' }))}>
            <option value="active" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Active</option>
            <option value="inactive" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Inactive</option>
          </select>
          <input placeholder="POS Override PIN (4–8 digits)" inputMode="numeric" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.posOverridePin} onChange={(e) => setForm((p) => ({ ...p, posOverridePin: e.target.value.replace(/\D/g, '').slice(0, 8) }))} />
          <input placeholder="Unique Identification PIN (4 digits)" inputMode="numeric" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.uniqueIdentificationPin} onChange={(e) => setForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
          {pinError && <p className="md:col-span-2 text-xs text-red-500">{pinError}</p>}
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
            <label htmlFor="add-user-tab-color" className="mb-1 block text-xs text-muted-foreground">User Tab Color</label>
            <input id="add-user-tab-color" type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={form.userTabColor} onChange={(e) => setForm((p) => ({ ...p, userTabColor: e.target.value }))} />
          </div>
          <input placeholder="External Payroll Employee ID" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.externalPayrollEmployeeId} onChange={(e) => setForm((p) => ({ ...p, externalPayrollEmployeeId: e.target.value }))} />
          {locations.length > 0 && (
            <div className="md:col-span-2">
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Locations</label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-3">
                {locations.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={form.locationIds.includes(l.id)} onChange={(e) => setForm((p) => ({ ...p, locationIds: e.target.checked ? [...p.locationIds, l.id] : p.locationIds.filter((id) => id !== l.id) }))} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
            Show passwords
          </label>
          <label className="md:col-span-2 flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.forcePasswordReset} onChange={(e) => setForm((p) => ({ ...p, forcePasswordReset: e.target.checked }))} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
            Force password reset on first login
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">Cancel</button>
          <button type="button" disabled={!canSubmit || saving} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create User
          </button>
        </div>
      </div>
    </div>
  );
}
