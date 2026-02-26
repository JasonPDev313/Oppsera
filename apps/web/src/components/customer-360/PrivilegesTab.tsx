'use client';

import { useState } from 'react';
import {
  Shield,
  Wallet,
  Tag,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Gift,
  CreditCard,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useCustomerPrivilegesExtended,
  useApplicableDiscountRules,
} from '@/hooks/use-customer-360';
import type {
  PrivilegeExtendedEntry,
  ApplicableDiscountRule,
} from '@/types/customer-360';

// ── Helpers ─────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  const abs = Math.abs(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(abs / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

const INSTRUMENT_TYPE_LABELS: Record<string, string> = {
  gift_card: 'Gift Cards',
  credit_book: 'Credit Books',
  raincheck: 'Rainchecks',
  range_card: 'Range Cards',
  rounds_card: 'Rounds Cards',
  prepaid_balance: 'Prepaid Balances',
  punchcard: 'Punch Cards',
  award: 'Awards',
};

function scopeLabel(scope: string): string {
  const map: Record<string, string> = {
    global: 'Global',
    customer: 'Customer-Specific',
    segment: 'Segment',
    membership_class: 'Membership Class',
  };
  return map[scope] ?? scope;
}

function scopeVariant(scope: string): string {
  const map: Record<string, string> = {
    global: 'info',
    customer: 'indigo',
    segment: 'purple',
    membership_class: 'warning',
  };
  return map[scope] ?? 'neutral';
}

// ── Skeleton ────────────────────────────────────────────────────

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
}

// ── Privilege Row ───────────────────────────────────────────────

function PrivilegeRow({ privilege }: { privilege: PrivilegeExtendedEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isExpired = privilege.expiresAt && new Date(privilege.expiresAt) < new Date();

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            privilege.isActive && !isExpired ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
          }`}>
            {privilege.isActive && !isExpired ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {privilege.privilegeType.replace(/_/g, ' ')}
              </span>
              <Badge variant={privilege.isActive && !isExpired ? 'success' : 'neutral'}>
                {isExpired ? 'expired' : privilege.isActive ? 'active' : 'inactive'}
              </Badge>
            </div>
            {privilege.reason && (
              <div className="text-xs text-muted-foreground">{privilege.reason}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {privilege.expiresAt && (
            <span className="text-xs text-muted-foreground">
              Expires {formatDate(privilege.expiresAt)}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <span className="text-muted-foreground">Effective</span>
              <div className="font-medium text-foreground">
                {privilege.effectiveDate ? formatDate(privilege.effectiveDate) : 'Immediate'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Expiration</span>
              <div className="font-medium text-foreground">
                {privilege.expirationDate ? formatDate(privilege.expirationDate) : 'None'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Expires At</span>
              <div className="font-medium text-foreground">
                {privilege.expiresAt ? formatDate(privilege.expiresAt) : 'Never'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Notes</span>
              <div className="font-medium text-foreground">
                {privilege.notes || '-'}
              </div>
            </div>
          </div>
          {Object.keys(privilege.value).length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-medium text-muted-foreground">Value</span>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
                {JSON.stringify(privilege.value, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Discount Rule Row ───────────────────────────────────────────

function DiscountRuleRow({ rule }: { rule: ApplicableDiscountRule }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
            <Tag className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{rule.name}</span>
              <Badge variant={scopeVariant(rule.scopeType) as any} className="text-[10px]">
                {scopeLabel(rule.scopeType)}
              </Badge>
              <span className="text-xs text-muted-foreground">Priority: {rule.priority}</span>
            </div>
            {rule.description && (
              <div className="text-xs text-muted-foreground">{rule.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rule.expirationDate && (
            <span className="text-xs text-muted-foreground">
              Until {formatDate(rule.expirationDate)}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-muted-foreground">Effective</span>
              <div className="font-medium text-foreground">
                {rule.effectiveDate ? formatDate(rule.effectiveDate) : 'Always'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Expires</span>
              <div className="font-medium text-foreground">
                {rule.expirationDate ? formatDate(rule.expirationDate) : 'Never'}
              </div>
            </div>
          </div>
          {Object.keys(rule.ruleJson).length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-medium text-muted-foreground">Rule Definition</span>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 text-xs text-foreground">
                {JSON.stringify(rule.ruleJson, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ────────────────────────────────────────────────────

export default function PrivilegesTab({ customerId }: { customerId: string }) {
  const { data: privData, isLoading: privLoading, error: privError } = useCustomerPrivilegesExtended(customerId);
  const { data: rulesData, isLoading: rulesLoading, error: rulesError } = useApplicableDiscountRules(customerId);

  const [section, setSection] = useState<'privileges' | 'stored_value' | 'discounts'>('privileges');

  const isLoading = privLoading || rulesLoading;
  const error = privError || rulesError;

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-muted-foreground">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm">Failed to load privileges</p>
      </div>
    );
  }

  const privileges = privData?.privileges ?? [];
  const storedValueSummary = privData?.storedValueSummary ?? { totalInstruments: 0, totalBalanceCents: 0, byType: [] };
  const discountRuleCount = privData?.discountRuleCount ?? 0;
  const applicableRules = rulesData?.rules ?? [];
  const activePrivileges = privileges.filter((p) => p.isActive);
  const inactivePrivileges = privileges.filter((p) => !p.isActive);

  return (
    <div className="space-y-6 p-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setSection('privileges')}
          className={`rounded-lg border p-4 text-left transition-colors ${
            section === 'privileges'
              ? 'border-indigo-500/30 bg-indigo-500/10 ring-1 ring-indigo-500/30'
              : 'border-border bg-surface hover:border-input'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4" />
            Privileges
          </div>
          <div className="mt-1 text-xl font-bold text-foreground">{activePrivileges.length}</div>
          <div className="text-xs text-muted-foreground">
            {inactivePrivileges.length} inactive
          </div>
        </button>
        <button
          type="button"
          onClick={() => setSection('stored_value')}
          className={`rounded-lg border p-4 text-left transition-colors ${
            section === 'stored_value'
              ? 'border-indigo-500/30 bg-indigo-500/10 ring-1 ring-indigo-500/30'
              : 'border-border bg-surface hover:border-input'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Wallet className="h-4 w-4" />
            Stored Value
          </div>
          <div className="mt-1 text-xl font-bold text-foreground">
            {formatMoney(storedValueSummary.totalBalanceCents)}
          </div>
          <div className="text-xs text-muted-foreground">
            {storedValueSummary.totalInstruments} instrument{storedValueSummary.totalInstruments !== 1 ? 's' : ''}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setSection('discounts')}
          className={`rounded-lg border p-4 text-left transition-colors ${
            section === 'discounts'
              ? 'border-indigo-500/30 bg-indigo-500/10 ring-1 ring-indigo-500/30'
              : 'border-border bg-surface hover:border-input'
          }`}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Tag className="h-4 w-4" />
            Discount Rules
          </div>
          <div className="mt-1 text-xl font-bold text-foreground">{applicableRules.length}</div>
          <div className="text-xs text-muted-foreground">
            {discountRuleCount} customer-specific
          </div>
        </button>
      </div>

      {/* Privileges Section */}
      {section === 'privileges' && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4 text-indigo-600" />
            Customer Privileges
          </h3>
          {privileges.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
              <Shield className="h-6 w-6" />
              <p className="text-sm">No privileges assigned</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activePrivileges.map((p) => (
                <PrivilegeRow key={p.id} privilege={p} />
              ))}
              {inactivePrivileges.length > 0 && (
                <>
                  <h4 className="mt-4 text-xs font-medium text-muted-foreground">Inactive Privileges</h4>
                  {inactivePrivileges.map((p) => (
                    <PrivilegeRow key={p.id} privilege={p} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stored Value Summary Section */}
      {section === 'stored_value' && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Wallet className="h-4 w-4 text-indigo-600" />
            Stored Value Summary
          </h3>
          {storedValueSummary.byType.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
              <Gift className="h-6 w-6" />
              <p className="text-sm">No active stored value instruments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {storedValueSummary.byType.map((svType) => (
                <div
                  key={svType.instrumentType}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {INSTRUMENT_TYPE_LABELS[svType.instrumentType] ?? svType.instrumentType}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {svType.count} active instrument{svType.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-foreground">
                      {formatMoney(svType.balanceCents)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-4">
                <span className="text-sm font-medium text-indigo-900">Total Balance</span>
                <span className="text-lg font-bold text-indigo-900">
                  {formatMoney(storedValueSummary.totalBalanceCents)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                For detailed instrument management, switch to the Stored Value tab.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Discount Rules Section */}
      {section === 'discounts' && (
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Tag className="h-4 w-4 text-indigo-600" />
            Applicable Discount Rules
          </h3>
          {applicableRules.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground">
              <Tag className="h-6 w-6" />
              <p className="text-sm">No applicable discount rules</p>
            </div>
          ) : (
            <div className="space-y-2">
              {applicableRules.map((rule) => (
                <DiscountRuleRow key={rule.id} rule={rule} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
