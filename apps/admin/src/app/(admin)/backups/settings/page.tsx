'use client';

import { useState } from 'react';
import {
  Settings,
  RefreshCw,
  Clock,
  Calendar,
  Shield,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { useBackupSettings, useBackupActions } from '@/hooks/use-backups';

const INTERVAL_OPTIONS = [
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 240, label: 'Every 4 hours' },
  { value: 1440, label: 'Once daily' },
];

export default function BackupSettingsPage() {
  const { settings, isLoading, error, refresh, updateSettings } = useBackupSettings();
  const { runRetention, isActing } = useBackupActions();
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [retentionResult, setRetentionResult] = useState<number | null>(null);

  if (isLoading) {
    return <div className="p-6 text-slate-400">Loading...</div>;
  }

  if (error || !settings) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error ?? 'Failed to load settings'}</p>
      </div>
    );
  }

  const handleToggle = async (field: string, value: boolean) => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings({ [field]: value });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleNumberChange = async (field: string, value: number) => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateSettings({ [field]: value });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleRunRetention = async () => {
    try {
      const result = await runRetention();
      setRetentionResult(result.expired);
      setTimeout(() => setRetentionResult(null), 5000);
    } catch {
      // handled via isActing
    }
  };

  return (
    <div className="p-6 max-w-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Backup Settings</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure automated backups, retention policies, and security.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle size={12} />
              Saved
            </span>
          )}
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Scheduling Section */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          Scheduling
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-200">Enable scheduled backups</p>
              <p className="text-xs text-slate-400 mt-0.5">Automatically create backups at regular intervals</p>
            </div>
            <button
              onClick={() => handleToggle('schedulingEnabled', !settings.schedulingEnabled)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.schedulingEnabled ? 'bg-indigo-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.schedulingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-1.5">Backup interval</label>
            <select
              value={settings.intervalMinutes}
              onChange={(e) => handleNumberChange('intervalMinutes', Number(e.target.value))}
              disabled={saving}
              className="bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 w-full"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {settings.lastScheduledBackupAt && (
            <p className="text-xs text-slate-500">
              Last scheduled backup: {new Date(settings.lastScheduledBackupAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Retention Section */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Calendar size={16} className="text-slate-400" />
          Retention Policy (GFS)
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Grandfather-Father-Son rotation: daily backups expire first, then weekly, then monthly.
          Manual and pre-restore backups never auto-expire.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-slate-300 block mb-1.5">
              Keep daily backups for
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={settings.retentionDailyDays}
                onChange={(e) => handleNumberChange('retentionDailyDays', Number(e.target.value))}
                disabled={saving}
                className="bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 w-24"
              />
              <span className="text-sm text-slate-400">days</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-1.5">
              Keep weekly backups for
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={52}
                value={settings.retentionWeeklyWeeks}
                onChange={(e) => handleNumberChange('retentionWeeklyWeeks', Number(e.target.value))}
                disabled={saving}
                className="bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 w-24"
              />
              <span className="text-sm text-slate-400">weeks</span>
            </div>
          </div>

          <div>
            <label className="text-sm text-slate-300 block mb-1.5">
              Keep monthly backups for
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={120}
                value={settings.retentionMonthlyMonths}
                onChange={(e) => handleNumberChange('retentionMonthlyMonths', Number(e.target.value))}
                disabled={saving}
                className="bg-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm border border-slate-600 w-24"
              />
              <span className="text-sm text-slate-400">months</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-700">
            <button
              onClick={handleRunRetention}
              disabled={isActing}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg text-sm hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              {isActing ? 'Running...' : 'Run Retention Cleanup Now'}
            </button>
            {retentionResult !== null && (
              <p className="text-xs text-green-400 mt-2">
                Cleaned up {retentionResult} expired backup{retentionResult !== 1 ? 's' : ''}.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Shield size={16} className="text-slate-400" />
          Security
        </h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-200">Require dual-admin approval for restore</p>
              <p className="text-xs text-slate-400 mt-0.5">
                When enabled, a different admin must approve restore requests.
                Disable this for local development.
              </p>
            </div>
            <button
              onClick={() => handleToggle('dualApprovalRequired', !settings.dualApprovalRequired)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.dualApprovalRequired ? 'bg-indigo-600' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.dualApprovalRequired ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400">
              <strong className="text-slate-300">Safety features always active:</strong>
            </p>
            <ul className="text-xs text-slate-400 mt-2 space-y-1 list-disc list-inside">
              <li>Pre-restore safety backup is always created automatically</li>
              <li>SHA-256 checksum verification before every restore</li>
              <li>Confirmation phrase required to initiate restore</li>
              <li>Restore executes in a single atomic transaction (all-or-nothing)</li>
              <li>All operations restricted to super_admin role only</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
