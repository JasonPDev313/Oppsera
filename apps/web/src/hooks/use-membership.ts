'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buildQueryString } from '@/lib/query-string';
import type {
  MembershipAccountListEntry,
  MembershipAccountDetail,
  MembershipAccountingSettings,
} from '@/types/customer-360';

// ── useMembershipAccounts ────────────────────────────────────────

export interface MembershipAccountFilters {
  status?: string;
  customerId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export function useMembershipAccounts(filters: MembershipAccountFilters = {}) {
  const [accounts, setAccounts] = useState<MembershipAccountListEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters);
      const res = await apiFetch<{
        data: MembershipAccountListEntry[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/membership/accounts${qs}`);
      setAccounts(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load membership accounts'));
    } finally {
      setIsLoading(false);
    }
  }, [filters.status, filters.customerId, filters.search, filters.cursor, filters.limit]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, isLoading, error, cursor, hasMore, mutate: fetchAccounts };
}

// ── useMembershipAccount ─────────────────────────────────────────

export function useMembershipAccount(accountId: string | null) {
  const [account, setAccount] = useState<MembershipAccountDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchAccount = useCallback(async () => {
    if (!accountId) {
      setAccount(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: MembershipAccountDetail }>(
        `/api/v1/membership/accounts/${accountId}`,
      );
      setAccount(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load membership account'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  return { account, isLoading, error, mutate: fetchAccount };
}

// ── useMembershipMutations ───────────────────────────────────────

export function useMembershipMutations() {
  const [isLoading, setIsLoading] = useState(false);

  const createAccount = useCallback(async (input: {
    accountNumber: string;
    primaryMemberId: string;
    customerId: string;
    startDate: string;
    endDate?: string;
    billingEmail?: string;
    statementDayOfMonth?: number;
    paymentTermsDays?: number;
    autopayEnabled?: boolean;
    creditLimitCents?: number;
    billingAccountId?: string;
    notes?: string;
    clientRequestId?: string;
  }) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>('/api/v1/membership/accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAccount = useCallback(async (
    accountId: string,
    input: Record<string, unknown>,
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addMember = useCallback(async (
    accountId: string,
    input: { customerId: string; role?: string; memberNumber?: string; chargePrivileges?: Record<string, unknown> },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/members`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateMember = useCallback(async (
    accountId: string,
    memberId: string,
    input: Record<string, unknown>,
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/members/${memberId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeMember = useCallback(async (
    accountId: string,
    memberId: string,
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/members/${memberId}`,
        { method: 'DELETE' },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addClass = useCallback(async (
    accountId: string,
    input: { className: string; effectiveDate: string; expirationDate?: string },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/classes`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addBillingItem = useCallback(async (
    accountId: string,
    input: {
      description: string;
      amountCents: number;
      frequency?: string;
      discountCents?: number;
      isSubMemberItem?: boolean;
    },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/billing-items`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateBillingItem = useCallback(async (
    accountId: string,
    itemId: string,
    input: Record<string, unknown>,
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/billing-items/${itemId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addAuthorizedUser = useCallback(async (
    accountId: string,
    input: { name: string; relationship?: string; effectiveDate?: string; expirationDate?: string },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/authorized-users`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAuthorizedUser = useCallback(async (
    accountId: string,
    userId: string,
    input: Record<string, unknown>,
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/authorized-users/${userId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    createAccount,
    updateAccount,
    addMember,
    updateMember,
    removeMember,
    addClass,
    addBillingItem,
    updateBillingItem,
    addAuthorizedUser,
    updateAuthorizedUser,
  };
}

// ── useMembershipSettings ────────────────────────────────────────

export function useMembershipSettings() {
  const [settings, setSettings] = useState<MembershipAccountingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: MembershipAccountingSettings | null }>(
        '/api/v1/membership/settings',
      );
      setSettings(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load membership settings'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (input: Record<string, unknown>) => {
    try {
      const res = await apiFetch<{ data: MembershipAccountingSettings }>(
        '/api/v1/membership/settings',
        { method: 'PATCH', body: JSON.stringify(input) },
      );
      setSettings(res.data);
      return res.data;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update membership settings');
    }
  }, []);

  return { settings, isLoading, error, updateSettings, mutate: fetchSettings };
}

// ── useMembershipSubscriptions (Session 6) ──────────────────────

import type { MembershipSubscription } from '@/types/membership';

export function useMembershipSubscriptions(accountId: string | null) {
  const [subscriptions, setSubscriptions] = useState<MembershipSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    if (!accountId) {
      setSubscriptions([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        data: MembershipSubscription[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/membership/accounts/${accountId}/subscriptions`);
      setSubscriptions(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load subscriptions'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  return { subscriptions, isLoading, error, mutate: fetchSubscriptions };
}

// ── useMembershipPlans (Session 6) ───────────────────────────────

import type { MembershipPlanV2 } from '@/types/membership';

export function useMembershipPlans() {
  const [plans, setPlans] = useState<MembershipPlanV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPlans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: MembershipPlanV2[] }>('/api/v1/membership/plans');
      setPlans(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load membership plans'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  return { plans, isLoading, error, mutate: fetchPlans };
}

// ── useMembershipStatements (Session 6) ──────────────────────────

import type { StatementEntry, StatementDetail } from '@/types/membership';

export function useMembershipStatements(accountId: string | null) {
  const [statements, setStatements] = useState<StatementEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatements = useCallback(async () => {
    if (!accountId) {
      setStatements([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        data: StatementEntry[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/membership/accounts/${accountId}/statements`);
      setStatements(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load statements'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchStatements();
  }, [fetchStatements]);

  return { statements, isLoading, error, mutate: fetchStatements };
}

// ── useStatementDetail (Session 6) ───────────────────────────────

export function useStatementDetail(accountId: string | null, statementId: string | null) {
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!accountId || !statementId) {
      setDetail(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StatementDetail }>(
        `/api/v1/membership/accounts/${accountId}/statements/${statementId}`,
      );
      setDetail(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load statement detail'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, statementId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { detail, isLoading, error, mutate: fetchDetail };
}

// ── useMinimumProgress (Session 7) ────────────────────────────────

import type {
  MinimumProgressEntry,
  MinimumHistoryEntry,
  MinimumComplianceDashboard,
  MinimumPolicyEntry,
  InitiationContractSummary,
  InitiationScheduleResult,
  PayoffQuote,
  DeferredRevenueScheduleResult,
} from '@/types/membership';

export function useMinimumProgress(
  accountId: string | null,
  filters: { periodStart?: string; periodEnd?: string } = {},
) {
  const [entries, setEntries] = useState<MinimumProgressEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!accountId) {
      setEntries([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters);
      const res = await apiFetch<{ data: MinimumProgressEntry[] }>(
        `/api/v1/membership/accounts/${accountId}/minimums${qs}`,
      );
      setEntries(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load minimum progress'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, filters.periodStart, filters.periodEnd]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return { entries, isLoading, error, mutate: fetchProgress };
}

// ── useMinimumHistory (Session 7) ──────────────────────────────────

export function useMinimumHistory(
  accountId: string | null,
  filters: { ruleId?: string; cursor?: string; limit?: number } = {},
) {
  const [items, setItems] = useState<MinimumHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!accountId) {
      setItems([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters);
      const res = await apiFetch<{
        data: MinimumHistoryEntry[];
        meta: { cursor: string | null; hasMore: boolean };
      }>(`/api/v1/membership/accounts/${accountId}/minimums/history${qs}`);
      setItems(res.data);
      setCursor(res.meta.cursor);
      setHasMore(res.meta.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load minimum history'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, filters.ruleId, filters.cursor, filters.limit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { items, isLoading, error, cursor, hasMore, mutate: fetchHistory };
}

// ── useMinimumCompliance (Session 7) ───────────────────────────────

export function useMinimumCompliance(
  filters: { periodStart?: string; periodEnd?: string; status?: string } = {},
) {
  const [dashboard, setDashboard] = useState<MinimumComplianceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCompliance = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters);
      const res = await apiFetch<{ data: MinimumComplianceDashboard }>(
        `/api/v1/membership/minimums/compliance${qs}`,
      );
      setDashboard(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load compliance dashboard'));
    } finally {
      setIsLoading(false);
    }
  }, [filters.periodStart, filters.periodEnd, filters.status]);

  useEffect(() => {
    fetchCompliance();
  }, [fetchCompliance]);

  return { dashboard, isLoading, error, mutate: fetchCompliance };
}

// ── useMinimumPolicies (Session 7) ─────────────────────────────────

export function useMinimumPolicies() {
  const [policies, setPolicies] = useState<MinimumPolicyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPolicies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: MinimumPolicyEntry[] }>(
        '/api/v1/membership/minimum-policies',
      );
      setPolicies(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load minimum policies'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  return { policies, isLoading, error, mutate: fetchPolicies };
}

// ── useMinimumMutations (Session 7) ────────────────────────────────

export function useMinimumMutations() {
  const [isLoading, setIsLoading] = useState(false);

  const configurePolicy = useCallback(async (input: {
    title: string;
    amountCents: number;
    bucketType?: string;
    allocationMethod?: string;
    rolloverPolicy?: string;
    excludeTax?: boolean;
    excludeTips?: boolean;
    excludeServiceCharges?: boolean;
    excludeDues?: boolean;
  }) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        '/api/v1/membership/minimum-policies',
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const assignMinimum = useCallback(async (
    accountId: string,
    input: {
      ruleId: string;
      startDate?: string;
      periodEnd?: string;
    },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/minimums/assign`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const computeMinimums = useCallback(async (input: {
    customerId: string;
    ruleId: string;
    periodStart: string;
    periodEnd: string;
    spentCents?: number;
  }) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${input.customerId}/minimums`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const rolloverMinimum = useCallback(async (
    accountId: string,
    input: {
      rollupId: string;
      newPeriodStart?: string;
      newPeriodEnd?: string;
    },
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/minimums/rollover`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    configurePolicy,
    assignMinimum,
    computeMinimums,
    rolloverMinimum,
  };
}

// ── useInitiationContracts (Session 8) ──────────────────────────

export function useInitiationContracts(membershipAccountId: string | null) {
  const [data, setData] = useState<InitiationContractSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchContracts = useCallback(async () => {
    if (!membershipAccountId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: InitiationContractSummary[] }>(
        `/api/v1/membership/accounts/${membershipAccountId}/initiation`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load initiation contracts'));
    } finally {
      setIsLoading(false);
    }
  }, [membershipAccountId]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  return { data, isLoading, error, mutate: fetchContracts };
}

// ── useInitiationSchedule (Session 8) ───────────────────────────

export function useInitiationSchedule(
  membershipAccountId: string | null,
  contractId: string | null,
) {
  const [data, setData] = useState<InitiationScheduleResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSchedule = useCallback(async () => {
    if (!membershipAccountId || !contractId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: InitiationScheduleResult }>(
        `/api/v1/membership/accounts/${membershipAccountId}/initiation/${contractId}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load initiation schedule'));
    } finally {
      setIsLoading(false);
    }
  }, [membershipAccountId, contractId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  return { data, isLoading, error, mutate: fetchSchedule };
}

// ── usePayoffQuote (Session 8) ──────────────────────────────────

export function usePayoffQuote(
  membershipAccountId: string | null,
  contractId: string | null,
  payoffDate?: string,
) {
  const [data, setData] = useState<PayoffQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchQuote = useCallback(async () => {
    if (!membershipAccountId || !contractId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const qs = payoffDate ? `?date=${payoffDate}` : '';
      const res = await apiFetch<{ data: PayoffQuote }>(
        `/api/v1/membership/accounts/${membershipAccountId}/initiation/${contractId}/payoff${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load payoff quote'));
    } finally {
      setIsLoading(false);
    }
  }, [membershipAccountId, contractId, payoffDate]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  return { data, isLoading, error };
}

// ── useInitiationMutations (Session 8) ──────────────────────────

export function useInitiationMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createContract = useCallback(async (
    accountId: string,
    input: {
      contractDate: string;
      initiationFeeCents: number;
      downPaymentCents?: number;
      aprBps?: number;
      termMonths: number;
      paymentDayOfMonth?: number;
      glInitiationRevenueAccountId?: string;
      glNotesReceivableAccountId?: string;
      glInterestIncomeAccountId?: string;
      glCapitalContributionAccountId?: string;
      glDeferredRevenueAccountId?: string;
      clientRequestId?: string;
    },
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/initiation`,
        { method: 'POST', body: JSON.stringify(input) },
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to create initiation contract');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const billInstallment = useCallback(async (
    accountId: string,
    contractId: string,
    periodIndex: number,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/initiation/${contractId}/bill`,
        { method: 'POST', body: JSON.stringify({ periodIndex }) },
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to bill installment');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const recordExtraPrincipal = useCallback(async (
    accountId: string,
    contractId: string,
    amountCents: number,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/initiation/${contractId}/extra-principal`,
        { method: 'POST', body: JSON.stringify({ amountCents }) },
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to record extra principal');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancelContract = useCallback(async (
    accountId: string,
    contractId: string,
    reason: string,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/accounts/${accountId}/initiation/${contractId}/cancel`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to cancel contract');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    createContract,
    billInstallment,
    recordExtraPrincipal,
    cancelContract,
  };
}

// ── useDeferredRevenue (Session 8) ──────────────────────────────

export function useDeferredRevenue(accountId?: string) {
  const [data, setData] = useState<DeferredRevenueScheduleResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDeferred = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ accountId });
      const res = await apiFetch<{ data: DeferredRevenueScheduleResult }>(
        `/api/v1/membership/deferred-revenue${qs}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load deferred revenue'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchDeferred();
  }, [fetchDeferred]);

  return { data, isLoading, error };
}

// ── Autopay Hooks (Session 9) ────────────────────────────────────

import type {
  AutopayProfile,
  AutopayDashboard,
  RiskDashboard,
  CollectionsTimelineEntry,
  RiskHoldEntry,
  BillingCycleRun,
  BillingStepName,
} from '@/types/membership';

export function useAutopayProfile(accountId: string | null) {
  const [data, setData] = useState<AutopayProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!accountId) {
      setData(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: AutopayProfile | null }>(
        `/api/v1/membership/accounts/${accountId}/autopay`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load autopay profile'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { data, isLoading, error, mutate: fetchProfile };
}

export function useAutopayDashboard() {
  const [data, setData] = useState<AutopayDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: AutopayDashboard }>(
        '/api/v1/membership/autopay/runs',
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load autopay dashboard'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return { data, isLoading, error, mutate: fetchDashboard };
}

export function useRiskDashboard() {
  const [data, setData] = useState<RiskDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRisk = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: RiskDashboard }>(
        '/api/v1/membership/risk',
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load risk dashboard'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisk();
  }, [fetchRisk]);

  return { data, isLoading, error, mutate: fetchRisk };
}

export function useCollectionsTimeline(accountId: string | null) {
  const [data, setData] = useState<CollectionsTimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!accountId) {
      setData([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CollectionsTimelineEntry[] }>(
        `/api/v1/membership/accounts/${accountId}/collections`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load collections timeline'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  return { data, isLoading, error, mutate: fetchTimeline };
}

export function useAccountHolds(accountId: string | null) {
  const [data, setData] = useState<RiskHoldEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchHolds = useCallback(async () => {
    if (!accountId) {
      setData([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: RiskHoldEntry[] }>(
        `/api/v1/membership/accounts/${accountId}/holds`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load account holds'));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchHolds();
  }, [fetchHolds]);

  return { data, isLoading, error, mutate: fetchHolds };
}

// ── Billing Command Center Hooks (Session 10) ────────────────────

export function useBillingCycleRun(runId?: string) {
  const url = runId
    ? `/api/v1/membership/billing-cycles/${runId}`
    : '/api/v1/membership/billing-cycles';
  const [data, setData] = useState<BillingCycleRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRun = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: BillingCycleRun | null }>(url);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load billing cycle run'));
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  return { data, isLoading, error, mutate: fetchRun };
}

export function useBillingCycleMutations() {
  const [isLoading, setIsLoading] = useState(false);

  const createPreview = useCallback(async (cycleDate: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: BillingCycleRun }>(
        '/api/v1/membership/billing-cycles',
        { method: 'POST', body: JSON.stringify({ cycleDate }) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const executeStep = useCallback(async (
    runId: string,
    stepName: BillingStepName,
    exceptions?: Array<{ membershipAccountId: string; reason: string }>,
  ) => {
    setIsLoading(true);
    try {
      const body: Record<string, unknown> = { stepName };
      if (exceptions) body.exceptions = exceptions;
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/billing-cycles/${runId}/steps`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closeCycle = useCallback(async (runId: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/membership/billing-cycles/${runId}/close`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      return res.data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, createPreview, executeStep, closeCycle };
}
