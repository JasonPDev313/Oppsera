'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronDown, Loader2, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { PMSProperty } from '@/hooks/use-pms';
import { useToast } from '@/components/ui/toast';

interface Props {
  userId: string;
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

interface UserDetail {
  id: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  status: 'invited' | 'active' | 'inactive' | 'locked';
  phone: string | null;
  tabColor: string | null;
  externalPayrollEmployeeId: string | null;
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  hasOverridePin: boolean;
  hasLoginPin: boolean;
}

interface EditForm {
  firstName: string;
  lastName: string;
  emailAddress: string;
  userName: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  userRole: string;
  additionalRoleIds: string[];
  userStatus: 'invited' | 'active' | 'inactive' | 'locked';
  posOverridePin: string;
  uniqueIdentificationPin: string;
  userTabColor: string;
  externalPayrollEmployeeId: string;
  locationIds: string[];
}

const emptyForm: EditForm = {
  firstName: '', lastName: '', emailAddress: '', userName: '',
  password: '', confirmPassword: '', phoneNumber: '', userRole: '',
  additionalRoleIds: [], userStatus: 'active', posOverridePin: '',
  uniqueIdentificationPin: '', userTabColor: '#4f46e5',
  externalPayrollEmployeeId: '', locationIds: [],
};

export default function EditUserModal({ userId, roles, locations, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const original = useRef<EditForm>(emptyForm);
  const [showPasswords, setShowPasswords] = useState(false);
  const [pinStatus, setPinStatus] = useState({ hasOverridePin: false, hasLoginPin: false });
  const backdropRef = useRef<HTMLDivElement>(null);

  // Housekeeper designations
  const [hkProperties, setHkProperties] = useState<PMSProperty[]>([]);
  const [designations, setDesignations] = useState<{ enabled: boolean; propertyId: string; existingId: string | null }>({ enabled: false, propertyId: '', existingId: null });
  const [designationsExpanded, setDesignationsExpanded] = useState(false);

  // Escape key + scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Fetch user detail on mount
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [userRes, hkRes, propsRes] = await Promise.all([
          apiFetch<{ data: UserDetail }>(`/api/v1/users/${userId}`, { signal: controller.signal }),
          apiFetch<{ data: Array<{ id: string; propertyId: string; isActive: boolean }> }>(`/api/v1/pms/housekeepers/by-user?userId=${userId}`, { signal: controller.signal }).catch(() => ({ data: [] as Array<{ id: string; propertyId: string; isActive: boolean }> })),
          apiFetch<{ data: PMSProperty[] }>('/api/v1/pms/properties', { signal: controller.signal }).catch(() => ({ data: [] as PMSProperty[] })),
        ]);
        if (controller.signal.aborted) return;
        const u = userRes.data;
        const populated: EditForm = {
          firstName: u.firstName ?? '', lastName: u.lastName ?? '',
          emailAddress: u.email, userName: u.username ?? '',
          password: '', confirmPassword: '', phoneNumber: u.phone ?? '',
          userRole: u.roles[0]?.id ?? '',
          additionalRoleIds: u.roles.slice(1).map((r) => r.id),
          userStatus: u.status, posOverridePin: '', uniqueIdentificationPin: '',
          userTabColor: u.tabColor ?? '#4f46e5',
          externalPayrollEmployeeId: u.externalPayrollEmployeeId ?? '',
          locationIds: u.locations.map((l) => l.id),
        };
        original.current = populated;
        setForm(populated);
        setPinStatus({ hasOverridePin: u.hasOverridePin ?? false, hasLoginPin: u.hasLoginPin ?? false });
        setHkProperties(propsRes.data);
        const activeHk = hkRes.data.find((h) => h.isActive);
        setDesignations({
          enabled: !!activeHk,
          propertyId: activeHk?.propertyId ?? (propsRes.data.length === 1 ? propsRes.data[0]!.id : ''),
          existingId: activeHk?.id ?? null,
        });
      } catch (error) {
        if (!controller.signal.aborted && error instanceof ApiError) toast.error(error.message);
        if (!controller.signal.aborted) onClose();
        return;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => { controller.abort(); };
  }, [userId, toast, onClose]);

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
    if (form.password && form.password.length < 8) return false;
    if (pinError) return false;
    return true;
  }, [form, pinError]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const orig = original.current;
      const patch: Record<string, unknown> = {};
      if (form.firstName !== orig.firstName) patch.firstName = form.firstName;
      if (form.lastName !== orig.lastName) patch.lastName = form.lastName;
      if (form.emailAddress !== orig.emailAddress) patch.emailAddress = form.emailAddress;
      if (form.userName !== orig.userName) patch.userName = form.userName;
      if (form.phoneNumber !== orig.phoneNumber) patch.phoneNumber = form.phoneNumber;
      if (form.userRole !== orig.userRole) patch.userRole = form.userRole;
      if (form.userStatus !== orig.userStatus) patch.userStatus = form.userStatus;
      if (form.userTabColor !== orig.userTabColor) patch.userTabColor = form.userTabColor;
      if (form.password) patch.password = form.password;
      if (form.posOverridePin) patch.posOverridePin = form.posOverridePin;
      if (form.uniqueIdentificationPin) patch.uniqueIdentificationPin = form.uniqueIdentificationPin;
      if (form.externalPayrollEmployeeId !== orig.externalPayrollEmployeeId) patch.externalPayrollEmployeeId = form.externalPayrollEmployeeId || '';
      if (JSON.stringify(form.additionalRoleIds.slice().sort()) !== JSON.stringify(orig.additionalRoleIds.slice().sort())) patch.additionalRoleIds = form.additionalRoleIds;
      if (JSON.stringify(form.locationIds.slice().sort()) !== JSON.stringify(orig.locationIds.slice().sort())) patch.locationIds = form.locationIds;

      await apiFetch(`/api/v1/users/${userId}`, { method: 'PATCH', body: JSON.stringify(patch) });

      if (designations.enabled && !designations.existingId && designations.propertyId) {
        await apiFetch('/api/v1/pms/housekeepers/from-user', {
          method: 'POST',
          body: JSON.stringify({ userId, propertyId: designations.propertyId }),
        }).catch(() => { /* best-effort */ });
      }

      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.details?.length ? error.details.map((d) => d.message).join('. ') : error.message);
      }
    } finally {
      setSaving(false);
    }
  }, [form, canSubmit, userId, designations, onSaved, toast]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-8 shadow-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-muted-foreground">Loading user details...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Edit User</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input placeholder="First Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
          <input placeholder="Last Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
          <input placeholder="Email Address" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.emailAddress} onChange={(e) => setForm((p) => ({ ...p, emailAddress: e.target.value }))} />
          <input placeholder="User Name" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.userName} onChange={(e) => setForm((p) => ({ ...p, userName: e.target.value }))} />
          <input placeholder="Phone Number" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.phoneNumber} onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
          <div>
            <label htmlFor="edit-user-role" className="mb-1 block text-xs font-medium text-muted-foreground">Primary Role</label>
            <select id="edit-user-role" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.userRole} onChange={(e) => setForm((p) => ({ ...p, userRole: e.target.value, additionalRoleIds: p.additionalRoleIds.filter((id) => id !== e.target.value) }))}>
              <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Role</option>
              {roles.map((r) => <option key={r.id} value={r.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{r.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <button type="button" onClick={() => { setShowPasswords((v) => !v); if (showPasswords) setForm((p) => ({ ...p, password: '', confirmPassword: '' })); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500">
              {showPasswords ? 'Cancel password change' : 'Set new password'}
            </button>
            {showPasswords && (
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input type="password" placeholder="New Password (min 8 characters)" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
                <input type="password" placeholder="Confirm Password" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.confirmPassword} onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))} />
                {form.password && form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="md:col-span-2 text-xs text-red-500">Passwords do not match</p>
                )}
                {form.password && form.password.length > 0 && form.password.length < 8 && (
                  <p className="md:col-span-2 text-xs text-red-500">Password must be at least 8 characters</p>
                )}
              </div>
            )}
          </div>
          <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.userStatus} onChange={(e) => setForm((p) => ({ ...p, userStatus: e.target.value as EditForm['userStatus'] }))}>
            <option value="invited" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Invited</option>
            <option value="active" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Active</option>
            <option value="inactive" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Inactive</option>
            <option value="locked" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Locked</option>
          </select>
          {roles.filter((r) => r.id !== form.userRole).length > 0 && (
            <div className="md:col-span-2">
              {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Additional Roles</label>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-3">
                {roles.filter((r) => r.id !== form.userRole).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={form.additionalRoleIds.includes(r.id)} onChange={(e) => setForm((p) => ({ ...p, additionalRoleIds: e.target.checked ? [...p.additionalRoleIds, r.id] : p.additionalRoleIds.filter((id) => id !== r.id) }))} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="relative">
            <input placeholder={pinStatus.hasOverridePin ? 'Override PIN set — enter new to change' : 'Override PIN, 4–8 digits'} inputMode="numeric" className={`w-full rounded-lg border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none pr-8 ${pinStatus.hasOverridePin ? 'border-green-600/40' : 'border-border'}`} value={form.posOverridePin} onChange={(e) => setForm((p) => ({ ...p, posOverridePin: e.target.value.replace(/\D/g, '').slice(0, 8) }))} />
            {pinStatus.hasOverridePin && !form.posOverridePin && (
              <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
          </div>
          <div className="relative">
            <input placeholder={pinStatus.hasLoginPin ? 'Unique ID PIN set — enter new to change' : 'Unique ID PIN, 4 digits'} inputMode="numeric" className={`w-full rounded-lg border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none pr-8 ${pinStatus.hasLoginPin ? 'border-green-600/40' : 'border-border'}`} value={form.uniqueIdentificationPin} onChange={(e) => setForm((p) => ({ ...p, uniqueIdentificationPin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            {pinStatus.hasLoginPin && !form.uniqueIdentificationPin && (
              <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
          </div>
          {pinError && <p className="md:col-span-2 text-xs text-red-500">{pinError}</p>}
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
            <label htmlFor="edit-user-tab-color" className="mb-1 block text-xs text-muted-foreground">User Tab Color</label>
            <input id="edit-user-tab-color" type="color" className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" value={form.userTabColor} onChange={(e) => setForm((p) => ({ ...p, userTabColor: e.target.value }))} />
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
          {hkProperties.length > 0 && (
            <div className="md:col-span-2">
              <button type="button" onClick={() => setDesignationsExpanded((v) => !v)} className="flex w-full items-center justify-between rounded-lg border border-border bg-muted px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/50">
                <span>Module Designations</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${designationsExpanded ? 'rotate-180' : ''}`} />
              </button>
              {designationsExpanded && (
                <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/50 p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" id="designation-housekeeper" checked={designations.enabled} disabled={!!designations.existingId} onChange={(e) => setDesignations((p) => ({ ...p, enabled: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500 disabled:opacity-50" />
                    <div className="flex-1">
                      <label htmlFor="designation-housekeeper" className="block text-sm font-medium text-foreground">
                        Housekeeper
                        {designations.existingId && <span className="ml-2 inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">Active</span>}
                      </label>
                      <p className="text-xs text-muted-foreground">Assign this user as a PMS housekeeper at a property.</p>
                      {designations.enabled && !designations.existingId && (
                        <select value={designations.propertyId} onChange={(e) => setDesignations((p) => ({ ...p, propertyId: e.target.value }))} className="mt-2 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none">
                          <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Property</option>
                          {hkProperties.map((p) => <option key={p.id} value={p.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{p.name}</option>)}
                        </select>
                      )}
                      {designations.existingId && (
                        <p className="mt-1 text-xs text-muted-foreground">Assigned to: {hkProperties.find((p) => p.id === designations.propertyId)?.name ?? 'Unknown property'}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">Cancel</button>
          <button type="button" disabled={!canSubmit || saving} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
