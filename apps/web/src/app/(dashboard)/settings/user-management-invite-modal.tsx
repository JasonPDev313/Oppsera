'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Shield, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface Props {
  roles: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

export default function InviteUserModal({ roles, locations, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ emailAddress: '', roleId: '', locationIds: [] as string[] });
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const canSubmit = !!(form.emailAddress && form.roleId);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await apiFetch('/api/v1/users/invite', { method: 'POST', body: JSON.stringify(form) });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }, [form, canSubmit, onSaved, toast]);

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === backdropRef.current) onClose(); }} role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Invite User</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-accent/50"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <input placeholder="Email Address" className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.emailAddress} onChange={(e) => setForm((p) => ({ ...p, emailAddress: e.target.value }))} />
          <select className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" value={form.roleId} onChange={(e) => setForm((p) => ({ ...p, roleId: e.target.value }))}>
            <option value="" style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>Select Role</option>
            {roles.map((r) => <option key={r.id} value={r.id} style={{ color: '#1f2937', backgroundColor: '#f9fafb' }}>{r.name}</option>)}
          </select>
          {locations.length > 0 && (
            <div className="rounded-lg border border-border bg-muted p-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground"><Shield className="h-3 w-3" /> Optional Location Scope</div>
              <div className="grid grid-cols-2 gap-2">
                {locations.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={form.locationIds.includes(l.id)} onChange={(e) => setForm((p) => ({ ...p, locationIds: e.target.checked ? [...p.locationIds, l.id] : p.locationIds.filter((id) => id !== l.id) }))} className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500" />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/50">Cancel</button>
          <button type="button" disabled={!canSubmit || saving} onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}
