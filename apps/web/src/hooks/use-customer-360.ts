'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type {
  CustomerHeaderData,
  CustomerOverviewData,
  CustomerContacts360,
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
  CustomerFinancialSummary,
  FinancialAccountEntry,
  UnifiedLedgerResult,
  CustomerAgingSummary,
  CreateFinancialAccountInput,
  UpdateFinancialAccountInput,
  AdjustLedgerInput,
  TransferInput,
  CustomerAuditTrailResult,
  ActivityFeedItem,
  CustomerNoteEntry,
  CommunicationEntry,
  RelationshipExtendedEntry,
  CustomerFileEntry,
  AddNoteInput,
  UpdateNoteInput,
  SendMessageInput,
  UpdateRelationshipInput,
  UploadFileInput,
  StoredValueInstrumentEntry,
  StoredValueTransactionsResult,
  DiscountRulesResult,
  DiscountRuleEntry,
  ApplicableDiscountRule,
  CustomerPrivilegesExtended,
  IssueStoredValueInput,
  RedeemStoredValueInput,
  ReloadStoredValueInput,
  TransferStoredValueInput,
  VoidStoredValueInput,
  CreateDiscountRuleInput,
  UpdateDiscountRuleInput,
  ToggleDiscountRuleInput,
} from '@/types/customer-360';
import { buildQueryString } from '@/lib/query-string';

// ── Customer Header Hook ────────────────────────────────────────

export function useCustomerHeader(customerId: string | null) {
  const [data, setData] = useState<CustomerHeaderData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerHeaderData }>(
        `/api/v1/customers/${customerId}/header`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customer header'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Customer Overview Hook ──────────────────────────────────────

export function useCustomerOverview(customerId: string | null) {
  const [data, setData] = useState<CustomerOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerOverviewData }>(
        `/api/v1/customers/${customerId}/overview`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customer overview'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Customer Contacts 360 Hook ──────────────────────────────────

export function useCustomerContacts360(customerId: string | null) {
  const [data, setData] = useState<CustomerContacts360 | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerContacts360 }>(
        `/api/v1/customers/${customerId}/contacts-360`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load customer contacts'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Email Mutations Hook ────────────────────────────────────────

export function useCustomerEmailMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addEmail = useCallback(async (customerId: string, input: AddEmailInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerEmailEntry }>(
        `/api/v1/customers/${customerId}/emails`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to add email');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateEmail = useCallback(async (customerId: string, emailId: string, input: UpdateEmailInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerEmailEntry }>(
        `/api/v1/customers/${customerId}/emails/${emailId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update email');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeEmail = useCallback(async (customerId: string, emailId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/emails/${emailId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove email');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { addEmail, updateEmail, removeEmail, isLoading, error };
}

// ── Phone Mutations Hook ────────────────────────────────────────

export function useCustomerPhoneMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addPhone = useCallback(async (customerId: string, input: AddPhoneInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerPhoneEntry }>(
        `/api/v1/customers/${customerId}/phones`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to add phone');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePhone = useCallback(async (customerId: string, phoneId: string, input: UpdatePhoneInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerPhoneEntry }>(
        `/api/v1/customers/${customerId}/phones/${phoneId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update phone');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removePhone = useCallback(async (customerId: string, phoneId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/phones/${phoneId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove phone');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { addPhone, updatePhone, removePhone, isLoading, error };
}

// ── Address Mutations Hook ──────────────────────────────────────

export function useCustomerAddressMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addAddress = useCallback(async (customerId: string, input: AddAddressInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerAddressEntry }>(
        `/api/v1/customers/${customerId}/addresses`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to add address');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAddress = useCallback(async (customerId: string, addressId: string, input: UpdateAddressInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerAddressEntry }>(
        `/api/v1/customers/${customerId}/addresses/${addressId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update address');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeAddress = useCallback(async (customerId: string, addressId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/addresses/${addressId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove address');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { addAddress, updateAddress, removeAddress, isLoading, error };
}

// ── Emergency Contact Mutations Hook ────────────────────────────

export function useEmergencyContactMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addEmergencyContact = useCallback(async (customerId: string, input: AddEmergencyContactInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: EmergencyContactEntry }>(
        `/api/v1/customers/${customerId}/emergency-contacts`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to add emergency contact');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateEmergencyContact = useCallback(async (customerId: string, contactId: string, input: UpdateEmergencyContactInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: EmergencyContactEntry }>(
        `/api/v1/customers/${customerId}/emergency-contacts/${contactId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update emergency contact');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeEmergencyContact = useCallback(async (customerId: string, contactId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/emergency-contacts/${contactId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove emergency contact');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { addEmergencyContact, updateEmergencyContact, removeEmergencyContact, isLoading, error };
}

// ── Session 2: Financial Hooks ──────────────────────────────────

export function useFinancialAccounts(customerId: string | null) {
  const [data, setData] = useState<CustomerFinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerFinancialSummary }>(
        `/api/v1/customers/${customerId}/financial`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load financial accounts'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useUnifiedLedger(customerId: string | null, filters?: {
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}) {
  const [data, setData] = useState<UnifiedLedgerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters ?? {});
      const res = await apiFetch<{ data: UnifiedLedgerResult }>(
        `/api/v1/customers/${customerId}/ledger${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load ledger'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, filters?.accountId, filters?.dateFrom, filters?.dateTo, filters?.type, filters?.status, filters?.limit, filters?.cursor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useAgingSummary(customerId: string | null) {
  const [data, setData] = useState<CustomerAgingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerAgingSummary }>(
        `/api/v1/customers/${customerId}/aging`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load aging summary'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useFinancialMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createAccount = useCallback(async (customerId: string, input: CreateFinancialAccountInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FinancialAccountEntry }>(
        `/api/v1/customers/${customerId}/financial`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to create financial account');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAccount = useCallback(async (customerId: string, accountId: string, input: UpdateFinancialAccountInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FinancialAccountEntry }>(
        `/api/v1/customers/${customerId}/financial/${accountId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update financial account');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const adjustLedger = useCallback(async (customerId: string, accountId: string, input: AdjustLedgerInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { id: string } }>(
        `/api/v1/customers/${customerId}/financial/${accountId}/adjust`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to adjust ledger');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const transferFunds = useCallback(async (customerId: string, input: TransferInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { id: string } }>(
        `/api/v1/customers/${customerId}/financial/transfer`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to transfer funds');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const configureAutopay = useCallback(async (customerId: string, accountId: string, input: { strategy: string; fixedAmountCents?: number; paymentMethodId?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FinancialAccountEntry }>(
        `/api/v1/customers/${customerId}/financial/${accountId}/autopay`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to configure autopay');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const placeHold = useCallback(async (customerId: string, accountId: string, input: { reason: string; holdType?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FinancialAccountEntry }>(
        `/api/v1/customers/${customerId}/financial/${accountId}/hold`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to place hold');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const liftHold = useCallback(async (customerId: string, accountId: string, reason: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FinancialAccountEntry }>(
        `/api/v1/customers/${customerId}/financial/${accountId}/hold`,
        { method: 'DELETE', body: JSON.stringify({ reason }) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to lift hold');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateCreditLimit = useCallback(async (customerId: string, accountId: string, input: { creditLimitCents: number; reason?: string }) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FinancialAccountEntry }>(
        `/api/v1/customers/${customerId}/financial/${accountId}/credit-limit`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update credit limit');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    createAccount,
    updateAccount,
    adjustLedger,
    transferFunds,
    configureAutopay,
    placeHold,
    liftHold,
    updateCreditLimit,
    isLoading,
    error,
  };
}

// ── Financial Audit Trail Hook ─────────────────────────────────

export function useFinancialAuditTrail(customerId: string | null, cursor?: string) {
  const [data, setData] = useState<CustomerAuditTrailResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ cursor, limit: 20 });
      const res = await apiFetch<{ data: CustomerAuditTrailResult }>(
        `/api/v1/customers/${customerId}/financial/audit${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load audit trail'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, cursor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

// ── Session 3: Activity + Communication + Relationships + Documents ──

interface ActivityFeedResult {
  items: ActivityFeedItem[];
  cursor: string | null;
  hasMore: boolean;
}

export function useActivityFeed(customerId: string | null, cursor?: string) {
  const [data, setData] = useState<ActivityFeedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ cursor, limit: 30 });
      const res = await apiFetch<{ data: ActivityFeedResult }>(
        `/api/v1/customers/${customerId}/activity-feed${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load activity feed'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, cursor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

interface NotesResult {
  items: CustomerNoteEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export function useCustomerNotes(customerId: string | null) {
  const [data, setData] = useState<NotesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: NotesResult }>(
        `/api/v1/customers/${customerId}/notes`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load notes'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useNoteMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addNote = useCallback(async (customerId: string, input: AddNoteInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerNoteEntry }>(
        `/api/v1/customers/${customerId}/notes`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to add note');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateNote = useCallback(async (customerId: string, noteId: string, input: UpdateNoteInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerNoteEntry }>(
        `/api/v1/customers/${customerId}/notes/${noteId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update note');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeNote = useCallback(async (customerId: string, noteId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/notes/${noteId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove note');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { addNote, updateNote, removeNote, isLoading, error };
}

interface CommunicationResult {
  items: CommunicationEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export function useCommunicationTimeline(customerId: string | null, filters?: { channel?: string; direction?: string }) {
  const [data, setData] = useState<CommunicationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString({ ...filters, limit: 30 });
      const res = await apiFetch<{ data: CommunicationResult }>(
        `/api/v1/customers/${customerId}/messages${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load communication timeline'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, filters?.channel, filters?.direction]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useMessageMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendMessage = useCallback(async (customerId: string, input: SendMessageInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CommunicationEntry }>(
        `/api/v1/customers/${customerId}/messages`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to send message');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sendMessage, isLoading, error };
}

interface RelationshipsExtendedResult {
  relationships: RelationshipExtendedEntry[];
}

export function useRelationshipsExtended(customerId: string | null) {
  const [data, setData] = useState<RelationshipsExtendedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { relationships: any[] } }>(
        `/api/v1/customers/${customerId}/relationships-extended`
      );
      // Map the backend shape to the frontend RelationshipExtendedEntry shape
      const mapped: RelationshipExtendedEntry[] = (res.data.relationships ?? []).map((r: any) => ({
        id: r.id,
        relatedCustomerId: r.relatedCustomer?.id ?? '',
        relatedCustomerName: r.relatedCustomer?.displayName ?? 'Unknown',
        relatedCustomerEmail: r.relatedCustomer?.email ?? null,
        relatedCustomerStatus: r.relatedCustomer?.status ?? 'unknown',
        relationshipType: r.relationshipType,
        direction: r.parentCustomerId === customerId ? 'child' : 'parent',
        isPrimary: r.isPrimary,
        effectiveDate: r.effectiveDate ?? null,
        expirationDate: r.expirationDate ?? null,
        notes: r.notes ?? null,
      }));
      setData({ relationships: mapped });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load relationships'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useRelationshipMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateRelationship = useCallback(async (customerId: string, relationshipId: string, input: UpdateRelationshipInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/customers/${customerId}/relationships/${relationshipId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update relationship');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeRelationship = useCallback(async (customerId: string, relationshipId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/relationships/${relationshipId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to remove relationship');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { updateRelationship, removeRelationship, isLoading, error };
}

interface FilesResult {
  items: CustomerFileEntry[];
  cursor: string | null;
  hasMore: boolean;
}

export function useCustomerFiles(customerId: string | null) {
  const [data, setData] = useState<FilesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FilesResult }>(
        `/api/v1/customers/${customerId}/files`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load files'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useFileMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = useCallback(async (customerId: string, input: UploadFileInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerFileEntry }>(
        `/api/v1/customers/${customerId}/files`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to upload file');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteFile = useCallback(async (customerId: string, documentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch(
        `/api/v1/customers/${customerId}/files/${documentId}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete file');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { uploadFile, deleteFile, isLoading, error };
}

// ── Session 4: Stored Value Hooks ──────────────────────────────

export function useStoredValueInstruments(customerId: string | null, filters?: {
  instrumentType?: string;
  status?: string;
}) {
  const [data, setData] = useState<{ instruments: StoredValueInstrumentEntry[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters ?? {});
      const res = await apiFetch<{ data: { instruments: StoredValueInstrumentEntry[] } }>(
        `/api/v1/customers/${customerId}/stored-value${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load stored value instruments'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, filters?.instrumentType, filters?.status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useStoredValueTransactions(customerId: string | null, instrumentId: string | null, filters?: {
  cursor?: string;
  limit?: number;
}) {
  const [data, setData] = useState<StoredValueTransactionsResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId || !instrumentId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters ?? {});
      const res = await apiFetch<{ data: StoredValueTransactionsResult }>(
        `/api/v1/customers/${customerId}/stored-value/${instrumentId}/transactions${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load transactions'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId, instrumentId, filters?.cursor, filters?.limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useStoredValueMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const issue = useCallback(async (customerId: string, input: IssueStoredValueInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StoredValueInstrumentEntry }>(
        `/api/v1/customers/${customerId}/stored-value`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to issue stored value');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const redeem = useCallback(async (customerId: string, instrumentId: string, input: RedeemStoredValueInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StoredValueInstrumentEntry }>(
        `/api/v1/customers/${customerId}/stored-value/${instrumentId}/redeem`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to redeem stored value');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reload = useCallback(async (customerId: string, instrumentId: string, input: ReloadStoredValueInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StoredValueInstrumentEntry }>(
        `/api/v1/customers/${customerId}/stored-value/${instrumentId}/reload`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to reload stored value');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const transfer = useCallback(async (customerId: string, input: TransferStoredValueInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: unknown }>(
        `/api/v1/customers/${customerId}/stored-value/transfer`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to transfer stored value');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const voidInstrument = useCallback(async (customerId: string, instrumentId: string, input: VoidStoredValueInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: StoredValueInstrumentEntry }>(
        `/api/v1/customers/${customerId}/stored-value/${instrumentId}/void`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to void stored value');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { issue, redeem, reload, transfer, voidInstrument, isLoading, error };
}

// ── Session 4: Discount Rules Hooks ────────────────────────────

export function useDiscountRules(filters?: {
  scopeType?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}) {
  const [data, setData] = useState<DiscountRulesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(filters ?? {});
      const res = await apiFetch<{ data: DiscountRulesResult }>(
        `/api/v1/customers/discount-rules${qs}`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load discount rules'));
    } finally {
      setIsLoading(false);
    }
  }, [filters?.scopeType, filters?.isActive, filters?.cursor, filters?.limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useApplicableDiscountRules(customerId: string | null) {
  const [data, setData] = useState<{ rules: ApplicableDiscountRule[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { rules: ApplicableDiscountRule[] } }>(
        `/api/v1/customers/${customerId}/applicable-discount-rules`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load applicable discount rules'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}

export function useDiscountRuleMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createRule = useCallback(async (input: CreateDiscountRuleInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: DiscountRuleEntry }>(
        `/api/v1/customers/discount-rules`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to create discount rule');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateRule = useCallback(async (ruleId: string, input: UpdateDiscountRuleInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: DiscountRuleEntry }>(
        `/api/v1/customers/discount-rules/${ruleId}`,
        { method: 'PATCH', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update discount rule');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleRule = useCallback(async (ruleId: string, input: ToggleDiscountRuleInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: DiscountRuleEntry }>(
        `/api/v1/customers/discount-rules/${ruleId}/toggle`,
        { method: 'POST', body: JSON.stringify(input) }
      );
      return res.data;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to toggle discount rule');
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { createRule, updateRule, toggleRule, isLoading, error };
}

// ── Session 4: Privileges Extended Hook ────────────────────────

export function useCustomerPrivilegesExtended(customerId: string | null) {
  const [data, setData] = useState<CustomerPrivilegesExtended | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: CustomerPrivilegesExtended }>(
        `/api/v1/customers/${customerId}/privileges-extended`
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load privileges'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, isLoading, error, mutate: fetchData };
}
