'use client';

import type { TagActionType } from '@/hooks/use-tag-actions';

interface ActionConfigFormProps {
  actionType: TagActionType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const CUSTOMER_FIELDS = [
  { value: 'category', label: 'Category' },
  { value: 'status', label: 'Status' },
  { value: 'preferredLanguage', label: 'Preferred Language' },
  { value: 'vipLevel', label: 'VIP Level' },
  { value: 'referralSource', label: 'Referral Source' },
] as const;

const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

const NOTIFICATION_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'in_app', label: 'In-App' },
  { value: 'push', label: 'Push Notification' },
] as const;

const WALLET_TYPES = [
  { value: 'loyalty_points', label: 'Loyalty Points' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'gift_card', label: 'Gift Card' },
] as const;

const PREFERENCE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'food_beverage', label: 'Food & Beverage' },
  { value: 'communication', label: 'Communication' },
  { value: 'service', label: 'Service' },
  { value: 'scheduling', label: 'Scheduling' },
] as const;

const FLAG_TYPES = [
  { value: 'vip', label: 'VIP' },
  { value: 'do_not_contact', label: 'Do Not Contact' },
  { value: 'no_alcohol', label: 'No Alcohol' },
  { value: 'requires_escort', label: 'Requires Escort' },
  { value: 'alert_management', label: 'Alert Management' },
  { value: 'special_needs', label: 'Special Needs' },
  { value: 'bad_debt', label: 'Bad Debt' },
] as const;

export function ActionConfigForm({ actionType, config, onChange }: ActionConfigFormProps) {
  const set = (key: string, value: unknown) => {
    onChange({ ...config, [key]: value });
  };

  const str = (key: string) => (config[key] as string) ?? '';
  const num = (key: string) => (config[key] as number) ?? 0;

  switch (actionType) {
    case 'log_activity':
      return (
        <div className="space-y-3">
          <Field label="Activity Type">
            <input
              type="text"
              value={str('activityType')}
              onChange={(e) => set('activityType', e.target.value)}
              placeholder="e.g. tag_applied, status_change"
              className={inputClass}
            />
          </Field>
          <Field label="Message">
            <textarea
              value={str('message')}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Activity log message..."
              rows={2}
              className={inputClass + ' resize-none'}
            />
          </Field>
        </div>
      );

    case 'set_customer_field':
      return (
        <div className="space-y-3">
          <Field label="Field" required>
            <select
              value={str('field')}
              onChange={(e) => set('field', e.target.value)}
              className={inputClass}
            >
              <option value="">Select field...</option>
              {CUSTOMER_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Value" required>
            <input
              type="text"
              value={str('value')}
              onChange={(e) => set('value', e.target.value)}
              placeholder="Value to set"
              className={inputClass}
            />
          </Field>
        </div>
      );

    case 'add_to_segment':
    case 'remove_from_segment':
      return (
        <div className="space-y-3">
          <Field label="Segment ID" required>
            <input
              type="text"
              value={str('segmentId')}
              onChange={(e) => set('segmentId', e.target.value)}
              placeholder="Enter segment ID"
              className={inputClass}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            {actionType === 'add_to_segment'
              ? 'Customer will be added to this segment when the tag is applied.'
              : 'Customer will be removed from this segment when the action triggers.'}
          </p>
        </div>
      );

    case 'set_service_flag':
      return (
        <div className="space-y-3">
          <Field label="Flag Type" required>
            <select
              value={str('flagType')}
              onChange={(e) => set('flagType', e.target.value)}
              className={inputClass}
            >
              <option value="">Select flag type...</option>
              {FLAG_TYPES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select
              value={str('severity')}
              onChange={(e) => set('severity', e.target.value)}
              className={inputClass}
            >
              <option value="">Default</option>
              {ALERT_SEVERITIES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <input
              type="text"
              value={str('note')}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Optional note"
              className={inputClass}
            />
          </Field>
        </div>
      );

    case 'remove_service_flag':
      return (
        <div className="space-y-3">
          <Field label="Flag Type" required>
            <select
              value={str('flagType')}
              onChange={(e) => set('flagType', e.target.value)}
              className={inputClass}
            >
              <option value="">Select flag type...</option>
              {FLAG_TYPES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
        </div>
      );

    case 'send_notification':
      return (
        <div className="space-y-3">
          <Field label="Channel">
            <select
              value={str('channel')}
              onChange={(e) => set('channel', e.target.value)}
              className={inputClass}
            >
              <option value="">Default</option>
              {NOTIFICATION_CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Template">
            <input
              type="text"
              value={str('template')}
              onChange={(e) => set('template', e.target.value)}
              placeholder="Template name or ID"
              className={inputClass}
            />
          </Field>
          <Field label="Recipient Role">
            <input
              type="text"
              value={str('recipientRole')}
              onChange={(e) => set('recipientRole', e.target.value)}
              placeholder="e.g. manager, staff"
              className={inputClass}
            />
          </Field>
          <p className="text-xs text-amber-500">
            V1: Notifications are logged only. Delivery will be enabled in a future release.
          </p>
        </div>
      );

    case 'adjust_wallet':
      return (
        <div className="space-y-3">
          <Field label="Wallet Type">
            <select
              value={str('walletType')}
              onChange={(e) => set('walletType', e.target.value)}
              className={inputClass}
            >
              <option value="">Default (Loyalty Points)</option>
              {WALLET_TYPES.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Amount (cents)" required>
            <input
              type="number"
              value={num('amountCents') || ''}
              onChange={(e) => set('amountCents', parseInt(e.target.value, 10) || 0)}
              placeholder="Positive to add, negative to deduct"
              className={inputClass}
            />
            <p className="mt-0.5 text-xs text-muted-foreground">
              Use negative values to deduct from wallet balance. Amount must be non-zero.
            </p>
          </Field>
          <Field label="Reason">
            <input
              type="text"
              value={str('reason')}
              onChange={(e) => set('reason', e.target.value)}
              placeholder="e.g. Loyalty bonus for VIP tag"
              className={inputClass}
            />
          </Field>
        </div>
      );

    case 'set_preference':
      return (
        <div className="space-y-3">
          <Field label="Category">
            <select
              value={str('category')}
              onChange={(e) => set('category', e.target.value)}
              className={inputClass}
            >
              <option value="">General</option>
              {PREFERENCE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Key" required>
            <input
              type="text"
              value={str('key')}
              onChange={(e) => set('key', e.target.value)}
              placeholder="e.g. dietary_restriction, seating"
              className={inputClass}
            />
          </Field>
          <Field label="Value" required>
            <input
              type="text"
              value={str('value')}
              onChange={(e) => set('value', e.target.value)}
              placeholder="Preference value"
              className={inputClass}
            />
          </Field>
        </div>
      );

    case 'create_alert':
      return (
        <div className="space-y-3">
          <Field label="Alert Type">
            <input
              type="text"
              value={str('alertType')}
              onChange={(e) => set('alertType', e.target.value)}
              placeholder="e.g. churn_risk, birthday"
              className={inputClass}
            />
          </Field>
          <Field label="Severity">
            <select
              value={str('severity')}
              onChange={(e) => set('severity', e.target.value)}
              className={inputClass}
            >
              <option value="">Default (Info)</option>
              {ALERT_SEVERITIES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Message" required>
            <textarea
              value={str('message')}
              onChange={(e) => set('message', e.target.value)}
              placeholder="Alert message to display..."
              rows={2}
              className={inputClass + ' resize-none'}
            />
          </Field>
        </div>
      );

    default:
      return (
        <p className="text-sm text-muted-foreground">
          No configuration needed for this action type.
        </p>
      );
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground ' +
  'focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-foreground">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

// ── Action type metadata ─────────────────────────────────────────────────────

export const ACTION_TYPE_META: Record<TagActionType, { label: string; description: string; icon: string }> = {
  log_activity: { label: 'Log Activity', description: 'Append to customer activity log', icon: 'FileText' },
  set_customer_field: { label: 'Set Customer Field', description: 'Update a customer profile field', icon: 'UserCog' },
  add_to_segment: { label: 'Add to Segment', description: 'Add customer to a segment', icon: 'UserPlus' },
  remove_from_segment: { label: 'Remove from Segment', description: 'Remove customer from a segment', icon: 'UserMinus' },
  set_service_flag: { label: 'Set Service Flag', description: 'Set a service flag on the customer', icon: 'Flag' },
  remove_service_flag: { label: 'Remove Service Flag', description: 'Remove a service flag', icon: 'FlagOff' },
  send_notification: { label: 'Send Notification', description: 'Send a notification (V1: log only)', icon: 'Bell' },
  adjust_wallet: { label: 'Adjust Wallet', description: 'Add or deduct wallet balance', icon: 'Wallet' },
  set_preference: { label: 'Set Preference', description: 'Set a customer preference', icon: 'Settings' },
  create_alert: { label: 'Create Alert', description: 'Create a customer alert', icon: 'AlertTriangle' },
};

export const TRIGGER_META: Record<string, { label: string; description: string }> = {
  on_apply: { label: 'On Apply', description: 'When tag is applied to customer' },
  on_remove: { label: 'On Remove', description: 'When tag is removed from customer' },
  on_expire: { label: 'On Expire', description: 'When tag expires automatically' },
};
