'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { adminFetch } from '@/lib/api-fetch';
import { useAdminRoles } from '@/hooks/use-staff';
import type { CreateStaffInput } from '@/types/users';

export default function CreateStaffPage() {
  const router = useRouter();
  const { data: roles, load: loadRoles } = useAdminRoles();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [sendInvite, setSendInvite] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const body: CreateStaffInput = {
        name: name.trim(),
        email: email.trim(),
        roleIds: selectedRoleIds,
        sendInvite,
      };
      if (phone.trim()) body.phone = phone.trim();
      if (!sendInvite && password) body.password = password;

      await adminFetch('/api/v1/admin/staff', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      router.push('/users/staff');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create staff member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back */}
      <Link
        href="/users/staff"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Staff
      </Link>

      <h1 className="text-xl font-bold text-white mb-6">Add Staff Member</h1>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Jane Smith"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="jane@oppsera.com"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="+1 (555) 000-0000"
          />
        </div>

        {/* Roles */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Roles *</label>
          <div className="space-y-2">
            {roles.map((role) => (
              <label
                key={role.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedRoleIds.includes(role.id)
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                  className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <p className="text-sm text-white font-medium">{role.name}</p>
                  {role.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{role.description}</p>
                  )}
                </div>
                <span className="ml-auto text-xs text-slate-500">{role.permissionCount} perms</span>
              </label>
            ))}
            {roles.length === 0 && (
              <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-400">No roles available yet.</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  You need to create at least one role before adding staff.{' '}
                  <Link href="/users/roles" className="underline hover:text-amber-300">
                    Go to Roles &amp; Permissions
                  </Link>{' '}
                  to create one, or run{' '}
                  <code className="font-mono bg-slate-800 px-1 rounded">npx tsx tools/scripts/seed-admin-roles.ts</code>{' '}
                  to seed the default system roles.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Invite or Password */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Access Method</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSendInvite(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm transition-colors ${
                sendInvite
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Send size={14} />
              Send Invite Email
            </button>
            <button
              type="button"
              onClick={() => setSendInvite(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm transition-colors ${
                !sendInvite
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              <UserPlus size={14} />
              Set Password
            </button>
          </div>
        </div>

        {/* Password field (when not inviting) */}
        {!sendInvite && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!sendInvite}
              minLength={8}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Minimum 8 characters"
            />
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Link
            href="/users/staff"
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || selectedRoleIds.length === 0 || !name || !email}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : sendInvite ? (
              <Send size={14} />
            ) : (
              <UserPlus size={14} />
            )}
            {sendInvite ? 'Create & Invite' : 'Create Staff'}
          </button>
        </div>
      </form>
    </div>
  );
}
