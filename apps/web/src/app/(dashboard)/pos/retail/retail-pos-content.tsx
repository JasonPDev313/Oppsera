'use client';

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  DollarSign,
  Receipt,
  Pause,
  History,
  Ban,
  Unlock,
  XCircle,
  Printer,
  RotateCcw,
  LogIn,
  LogOut,
  X,
  Banknote,
  Wrench,
  Send,
  ShieldOff,
  LayoutGrid,
  List,
  Settings,
  Pencil,
  QrCode,
  Copy,
  PlusCircle,
  StickyNote,
  Gift,
  Monitor,
  Mail,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { useToast } from '@/components/ui/toast';
import { usePOSConfig } from '@/hooks/use-pos-config';
import { usePOS } from '@/hooks/use-pos';
import { useRegisterTabs } from '@/hooks/use-register-tabs';
import { useCatalogForPOS } from '@/hooks/use-catalog-for-pos';
import { useShift } from '@/hooks/use-shift';
import { useFnbSettings } from '@/hooks/use-fnb-settings';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Cart } from '@/components/pos/Cart';
import { CartTotals } from '@/components/pos/CartTotals';
import { SuggestedItemsStrip } from '@/components/pos/SuggestedItemsStrip';
import { VirtualItemGrid } from '@/components/pos/VirtualItemGrid';
import { ItemListRow } from '@/components/pos/shared/ItemListRow';
import { CustomerAttachment } from '@/components/pos/CustomerAttachment';
import {
  DepartmentTabs,
  SubDepartmentTabs,
  CategoryRail,
  CatalogBreadcrumb,
  QuickMenuTab,
} from '@/components/pos/catalog-nav';
import { RegisterTabs } from '@/components/pos/RegisterTabs';
import { useProfileDrawer } from '@/components/customer-profile-drawer';
import { useRetailGuestPay } from '@/hooks/use-retail-guest-pay';
import { useCustomerDisplayBroadcast } from '@/hooks/use-customer-display';
import { useItemEditDrawer } from '@/components/inventory/ItemEditDrawerContext';
import { usePermissions } from '@/hooks/use-permissions';
import { useManagerOverride } from '@/hooks/use-manager-override';
import { ManagerPinModal } from '@/components/ui/manager-pin-modal';

// TenderDialog kept as fallback; PaymentPanel is the new inline flow
import { TenderDialog } from '@/components/pos/TenderDialog';
import { PaymentPanel } from '@/components/pos/shared/PaymentPanel';
import { ReceiptPreviewDialog } from '@/components/pos/shared/ReceiptPreviewDialog';
import { ReturnDialog } from '@/components/pos/shared/ReturnDialog';
import { printReceiptDocument } from '@/lib/receipt-printer';
import { apiFetch } from '@/lib/api-client';
import type { ReceiptDocument } from '@oppsera/shared';
import { SplitTenderPanel } from '@/components/pos/shared/SplitTenderPanel';
import { GiftCardTenderDialog } from '@/components/pos/shared/GiftCardTenderDialog';
import { POSSearchBar } from '@/components/pos/shared/POSSearchBar';
import { OfflineSyncBadge } from '@/components/pos/shared/OfflineSyncBadge';
import { QuickMenuGrid } from '@/components/pos/shared/QuickMenuGrid';
import type { QuickMenuPage } from '@/components/pos/shared/QuickMenuGrid';
import { initOfflineSync } from '@/lib/pos-offline-sync';
const POSSettingsPanel = dynamic(() => import('@/components/pos/settings/POSSettingsPanel').then(m => ({ default: m.POSSettingsPanel })), { ssr: false });
const QuickMenuEditor = dynamic(() => import('@/components/pos/settings/QuickMenuEditor').then(m => ({ default: m.QuickMenuEditor })), { ssr: false });
import { OpenShiftDialog } from '@/components/pos/OpenShiftDialog';
import { CloseShiftDialog } from '@/components/pos/CloseShiftDialog';
import { DrawerEventDialog } from '@/components/pos/DrawerEventDialog';
// Lazy-loaded dialogs — infrequently used, reduces initial bundle
const ModifierDialog = dynamic(() => import('@/components/pos/ModifierDialog').then(m => ({ default: m.ModifierDialog })), { ssr: false });
const OptionPickerDialog = dynamic(() => import('@/components/pos/OptionPickerDialog').then(m => ({ default: m.OptionPickerDialog })), { ssr: false });
const TaxExemptDialog = dynamic(() => import('@/components/pos/TaxExemptDialog').then(m => ({ default: m.TaxExemptDialog })), { ssr: false });
const NewCustomerDialog = dynamic(() => import('@/components/pos/NewCustomerDialog').then(m => ({ default: m.NewCustomerDialog })), { ssr: false });
const ToolsView = dynamic(() => import('@/components/pos/ToolsView').then(m => ({ default: m.ToolsView })), { ssr: false });
const DiscountDialog = dynamic(() => import('@/components/pos/DiscountDialog').then(m => ({ default: m.DiscountDialog })), { ssr: false });
const ServiceChargeDialog = dynamic(() => import('@/components/pos/ServiceChargeDialog').then(m => ({ default: m.ServiceChargeDialog })), { ssr: false });
const PriceOverrideDialog = dynamic(() => import('@/components/pos/PriceOverrideDialog').then(m => ({ default: m.PriceOverrideDialog })), { ssr: false });
const VoidLineDialog = dynamic(() => import('@/components/pos/VoidLineDialog').then(m => ({ default: m.VoidLineDialog })), { ssr: false });
const CompDialog = dynamic(() => import('@/components/pos/CompDialog').then(m => ({ default: m.CompDialog })), { ssr: false });
import type { CatalogItemForPOS, AddLineItemInput, HeldOrder, RecordTenderResult, OrderLine, Order } from '@/types/pos';
import type { FnbMetadata, RetailMetadata } from '@oppsera/shared';

// ── Helpers ───────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Recall Dialog (inline) ────────────────────────────────────────

interface RecallDialogProps {
  open: boolean;
  onClose: () => void;
  onRecall: (orderId: string) => void;
  heldOrderCount: number;
}

function RecallDialog({ open, onClose, onRecall, heldOrderCount }: RecallDialogProps) {
  // V1: Simple placeholder — real implementation would fetch held orders from API
  const [heldOrders] = useState<HeldOrder[]>([]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Recall Order</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {heldOrderCount} held {heldOrderCount === 1 ? 'order' : 'orders'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
          {heldOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <History aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No held orders found for this terminal
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Orders held on this terminal will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {heldOrders.map((held) => (
                <button
                  key={held.id}
                  type="button"
                  onClick={() => onRecall(held.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {held.orderNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {held.itemCount} {held.itemCount === 1 ? 'item' : 'items'} &middot;{' '}
                      {held.heldBy}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatMoney(held.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(held.heldAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Email Quote Dialog (inline) ──────────────────────────────────

interface EmailQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  businessName: string;
}

function EmailQuoteDialog({ open, onClose, orderId, businessName }: EmailQuoteDialogProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  // Reset on open
  useEffect(() => {
    if (open) {
      setEmail('');
      setSending(false);
      setSent(false);
    }
  }, [open]);

  const handleSend = useCallback(async () => {
    if (!email || sending) return;
    setSending(true);
    try {
      await apiFetch(`/api/v1/orders/${orderId}/email-quote`, {
        method: 'POST',
        body: JSON.stringify({ email, businessName }),
      });
      setSent(true);
      toast.success('Quote sent successfully');
      setTimeout(onClose, 1200);
    } catch {
      toast.error('Failed to send quote email');
    } finally {
      setSending(false);
    }
  }, [email, sending, orderId, businessName, toast, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
          <h3 className="text-lg font-semibold text-foreground">Email Quote</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4">
          <label htmlFor="quote-email" className="mb-1.5 block text-sm font-medium text-foreground">
            Customer email
          </label>
          <input
            id="quote-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            placeholder="customer@example.com"
            autoFocus
            className="w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {sent && (
            <p className="mt-2 text-sm text-green-500">Quote sent!</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!email || sending || sent}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send Quote'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Custom Item Portal ────────────────────────────────────────────

interface CustomItemPortalProps {
  allItems: CatalogItemForPOS[];
  onAdd: (miscItem: CatalogItemForPOS, name: string, priceCents: number, qty: number) => void;
  onClose: () => void;
}

const CustomItemPortal = memo(function CustomItemPortal({
  allItems, onAdd, onClose,
}: CustomItemPortalProps) {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [qty, setQty] = useState(1);
  const nameRef = useRef<HTMLInputElement>(null);

  // Find MISC catalog item (sku or name match)
  const miscItem = useMemo(() => {
    const bySku = allItems.find(
      (i) => i.sku?.toUpperCase() === 'MISC' || i.sku?.toUpperCase() === 'MISCELLANEOUS',
    );
    if (bySku) return bySku;
    return allItems.find(
      (i) => i.name.toLowerCase().includes('miscellaneous') || i.name.toLowerCase().includes('misc item'),
    ) ?? null;
  }, [allItems]);

  // Auto-focus name input on mount
  useEffect(() => { nameRef.current?.focus(); }, []);

  const priceCents = Math.round((parseFloat(priceStr) || 0) * 100);
  const canSubmit = name.trim().length > 0 && priceCents > 0 && qty > 0 && miscItem !== null;

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !miscItem) return;
    onAdd(miscItem, name.trim(), priceCents, qty);
  }, [canSubmit, miscItem, name, priceCents, qty, onAdd]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-lg bg-surface shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
          <h3
            className="text-lg font-semibold text-foreground"
            style={{ fontSize: 'calc(1.125rem * var(--pos-font-scale, 1))' }}
          >
            Custom Item
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {miscItem === null ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-500">Miscellaneous Item Required</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a catalog item with SKU &ldquo;MISC&rdquo; to enable custom line items.
                This item acts as a placeholder for ad-hoc entries.
              </p>
            </div>
          ) : (
            <>
              {/* Item Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Item Name
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
                  placeholder="e.g. Custom Engraving"
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
                />
              </div>

              {/* Price + Qty row */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={priceStr}
                    onChange={(e) => setPriceStr(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
                  />
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Qty
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
                    className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
                  />
                </div>
              </div>

              {/* Total preview */}
              {priceCents > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total: {formatMoney(priceCents * qty)}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            Cancel
          </button>
          {miscItem !== null && (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
            >
              <PlusCircle aria-hidden="true" className="h-4 w-4" />
              Add to Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Transaction Notes Portal ─────────────────────────────────────

const TransactionNotesPortal = memo(function TransactionNotesPortal({
  orderId,
  initialNotes,
  onSave,
  onClose,
}: {
  orderId: string;
  initialNotes: string;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{ data: Order }>(
        `/api/v1/orders/${orderId}`,
        { method: 'PATCH', body: JSON.stringify({ notes: notes.trim() || null }) },
      );
      onSave(res.data.notes ?? '');
    } catch {
      // keep dialog open so user can retry
    } finally {
      setSaving(false);
    }
  }, [orderId, notes, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Transaction Notes"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-lg font-semibold text-foreground"
            style={{ fontSize: 'calc(1.125rem * var(--pos-font-scale, 1))' }}
          >
            Transaction Notes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="Add notes for this transaction..."
          className="w-full resize-none rounded-lg border border-input bg-surface px-3 py-2 text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {notes.length} / 2000
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
});

// ── Retail POS Page ───────────────────────────────────────────────

function RetailPOSPage({ isActive = true }: { isActive?: boolean }) {
  const { locations, user, tenant } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const { toast } = useToast();
  const canEditItem = isModuleEnabled('catalog');
  const { can } = usePermissions();
  const itemGridScrollRef = useRef<HTMLDivElement>(null);

  // Location
  const locationId = locations[0]?.id ?? '';

  // KDS routing mode — Retail POS shows Send button unless mode is 'fb_only'
  const { settings: kitchenSettings } = useFnbSettings({ moduleKey: 'fnb_kitchen', locationId });
  const kdsRoutingMode = typeof kitchenSettings.kds_routing_mode === 'string'
    ? kitchenSettings.kds_routing_mode
    : 'fb_and_retail';
  const kdsSendEnabled = kdsRoutingMode !== 'fb_only';

  // Hooks
  const { config, setConfig, isLoading: configLoading } = usePOSConfig(locationId, 'retail');
  const catalog = useCatalogForPOS(locationId, isActive);
  const pos = usePOS(config ?? {
    posMode: 'retail',
    terminalId: '',
    locationId,
    tipEnabled: false,
    receiptMode: 'ask' as const,
    barcodeEnabled: true,
    kitchenSendEnabled: false,
  }, { onItemNotFound: catalog.refresh });
  const registerTabs = useRegisterTabs({
    terminalId: config?.terminalId ?? '',
    pos,
    employeeId: user?.id ?? '',
    employeeName: user?.name ?? '',
  });
  const shift = useShift(locationId, config?.terminalId ?? '');
  const profileDrawer = useProfileDrawer();
  const itemEditDrawer = useItemEditDrawer();
  const guestPay = useRetailGuestPay({
    orderId: pos.currentOrder?.id ?? null,
    pollEnabled: isActive,
    onPaymentConfirmed: () => {
      toast.success('Guest payment confirmed!');
    },
  });
  const customerDisplay = useCustomerDisplayBroadcast();

  // Stable refs for pos and registerTabs — prevents cascading identity changes
  // in callbacks that depend on them (e.g. handlePaymentComplete), which would
  // cause PaymentPanel's success auto-dismiss timer to reset every render.
  const posRef = useRef(pos);
  posRef.current = pos;
  const registerTabsRef = useRef(registerTabs);
  registerTabsRef.current = registerTabs;

  // Build orderLabels map for tab display
  const orderLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (pos.currentOrder) {
      map.set(pos.currentOrder.id, `#${pos.currentOrder.orderNumber}`);
    }
    return map;
  }, [pos.currentOrder]);

  const handleEditItem = useCallback(
    (itemId: string) => {
      // Look up POS item for instant pre-seed (no loading skeleton)
      const posItem = catalog.allItems.find((i) => i.id === itemId);
      const preSeed = posItem
        ? {
            name: posItem.name,
            itemType: posItem.type,
            categoryId: posItem.categoryId,
            priceCents: posItem.price,
            sku: posItem.sku,
            barcode: posItem.barcode,
            isTrackable: posItem.isTrackInventory,
            metadata: posItem.metadata,
            onHand: posItem.onHand,
          }
        : undefined;
      itemEditDrawer.open(itemId, { preSeed, onSaveSuccess: catalog.refresh });
    },
    [itemEditDrawer, catalog],
  );

  const handleViewHistory = useCallback(
    (itemId: string) => {
      const posItem = catalog.allItems.find((i) => i.id === itemId);
      const preSeed = posItem
        ? {
            name: posItem.name,
            itemType: posItem.type,
            categoryId: posItem.categoryId,
            priceCents: posItem.price,
            sku: posItem.sku,
            barcode: posItem.barcode,
            isTrackable: posItem.isTrackInventory,
            metadata: posItem.metadata,
            onHand: posItem.onHand,
          }
        : undefined;
      itemEditDrawer.open(itemId, { section: 'activity', preSeed, onSaveSuccess: catalog.refresh });
    },
    [itemEditDrawer, catalog],
  );

  const handleArchiveItem = useCallback(
    (_itemId: string) => {
      toast.info('Archive coming soon — use Edit Item to manage inventory');
    },
    [toast],
  );

  // ── Manager override PIN ──────────────────────────────────────
  const managerOverride = useManagerOverride();

  // ── Permission-gated POS actions ────────────────────────────────
  const posPerms = useMemo(() => ({
    voidOrder: can('orders.void'),
    discount: can('discounts.apply'),
    serviceCharge: can('charges.manage'),
    cashDrawer: can('cash.drawer'),
    shiftManage: can('shift.manage'),
    returns: can('returns.create'),
    priceOverride: can('price.override'),
  }), [can]);

  // ── View state ──────────────────────────────────────────────────

  type ViewMode = 'catalog' | 'quick' | 'tools';
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [quickMenuTab, setQuickMenuTab] = useState<'favorites' | 'recent'>('favorites');

  // Grid vs List view mode — persisted to localStorage, falls back to layout config default
  const [catalogViewMode, setCatalogViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem('pos_catalog_view_mode') as 'grid' | 'list') || config?.layout?.defaultViewMode || 'grid';
  });
  const handleCatalogViewModeChange = useCallback((mode: 'grid' | 'list') => {
    setCatalogViewMode(mode);
    try { localStorage.setItem('pos_catalog_view_mode', mode); } catch { /* */ }
  }, []);

  // ── Dialog state ────────────────────────────────────────────────

  const [modifierItem, setModifierItem] = useState<CatalogItemForPOS | null>(null);
  const [optionItem, setOptionItem] = useState<CatalogItemForPOS | null>(null);
  const [packageItem, setPackageItem] = useState<CatalogItemForPOS | null>(null);

  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showServiceChargeDialog, setShowServiceChargeDialog] = useState(false);
  const [showRecallDialog, setShowRecallDialog] = useState(false);
  const [showTaxExemptDialog, setShowTaxExemptDialog] = useState(false);
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false);

  // Payment flow — inline panel replaces old picker+dialog
  const [posView, setPosView] = useState<'order' | 'payment'>('order');
  // Legacy fallbacks (kept for TenderDialog in edge cases)
  const [, setShowPaymentPicker] = useState(false);
  const [showTenderDialog, setShowTenderDialog] = useState(false);
  const [selectedTenderType] = useState<'cash' | 'check' | 'voucher'>('cash');
  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);

  // Confirm dialogs
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showShiftEndConfirm, setShowShiftEndConfirm] = useState(false);
  const [showOpenShiftDialog, setShowOpenShiftDialog] = useState(false);
  const [showDrawerEventDialog, setShowDrawerEventDialog] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showSplitTender, setShowSplitTender] = useState(false);
  const [showGiftCardDialog, setShowGiftCardDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickMenuEditor, setShowQuickMenuEditor] = useState(false);
  const [showCustomItemDialog, setShowCustomItemDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showEmailQuoteDialog, setShowEmailQuoteDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // Line-level edit dialogs (triggered from Cart → LineItemEditPanel)
  const [editTargetLine, setEditTargetLine] = useState<OrderLine | null>(null);
  const [showLinePriceOverride, setShowLinePriceOverride] = useState(false);
  const [showLineVoidDialog, setShowLineVoidDialog] = useState(false);
  const [showLineCompDialog, setShowLineCompDialog] = useState(false);

  // Multi-select cart mode
  const [cartSelectMode, setCartSelectMode] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());

  const toggleCartSelectMode = useCallback(() => {
    setCartSelectMode((prev) => {
      if (prev) setSelectedLineIds(new Set());
      return !prev;
    });
  }, []);

  const toggleLineSelect = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }, []);

  const handleBatchRemove = useCallback(() => {
    for (const lineId of selectedLineIds) {
      pos.removeItem(lineId);
    }
    setSelectedLineIds(new Set());
    setCartSelectMode(false);
  }, [selectedLineIds, pos]);

  const handleBatchDiscount = useCallback(() => {
    setShowDiscountDialog(true);
  }, []);

  // ── Line-level edit handlers (Cart → LineItemEditPanel) ──────────

  const handleLinePriceOverride = useCallback((line: OrderLine) => {
    // Check for discount signal from DiscountSubPanel
    const discountLine = line as OrderLine & { _discountPrice?: number };
    if (discountLine._discountPrice != null) {
      // Discount applied inline — perform remove+re-add with the discounted price
      const newPrice = discountLine._discountPrice;
      pos.removeItem(line.id);
      pos.addItem({
        catalogItemId: line.catalogItemId,
        qty: line.qty,
        modifiers: line.modifiers?.map((m) => ({
          modifierId: m.modifierId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
          isDefault: m.isDefault,
        })) ?? undefined,
        specialInstructions: line.specialInstructions ?? undefined,
        selectedOptions: line.selectedOptions ?? undefined,
        notes: line.notes ?? undefined,
        priceOverride: { unitPrice: newPrice, reason: 'discount', approvedBy: user?.name ?? 'manager' },
        _display: { name: line.catalogItemName, unitPrice: newPrice, itemType: line.itemType, sku: line.catalogItemSku },
      });
      return;
    }
    setEditTargetLine(line);
    setShowLinePriceOverride(true);
  }, [pos, user]);

  const handleLinePriceOverrideApply = useCallback(
    (newPrice: number, reason: string, approvedBy: string) => {
      if (!editTargetLine) return;
      pos.removeItem(editTargetLine.id);
      pos.addItem({
        catalogItemId: editTargetLine.catalogItemId,
        qty: editTargetLine.qty,
        modifiers: editTargetLine.modifiers?.map((m) => ({
          modifierId: m.modifierId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
          isDefault: m.isDefault,
        })) ?? undefined,
        specialInstructions: editTargetLine.specialInstructions ?? undefined,
        selectedOptions: editTargetLine.selectedOptions ?? undefined,
        notes: editTargetLine.notes ?? undefined,
        priceOverride: { unitPrice: newPrice, reason, approvedBy },
        _display: { name: editTargetLine.catalogItemName, unitPrice: newPrice, itemType: editTargetLine.itemType, sku: editTargetLine.catalogItemSku },
      });
      setShowLinePriceOverride(false);
      setEditTargetLine(null);
    },
    [editTargetLine, pos],
  );

  const handleLineVoid = useCallback((line: OrderLine) => {
    setEditTargetLine(line);
    setShowLineVoidDialog(true);
  }, []);

  const handleLineVoidConfirm = useCallback(
    (_reason: string, _wasteTracking: boolean) => {
      if (!editTargetLine) return;
      pos.removeItem(editTargetLine.id);
      setShowLineVoidDialog(false);
      setEditTargetLine(null);
    },
    [editTargetLine, pos],
  );

  const handleLineComp = useCallback((line: OrderLine) => {
    setEditTargetLine(line);
    setShowLineCompDialog(true);
  }, []);

  const handleLineCompConfirm = useCallback(
    (reason: string, _category: string) => {
      if (!editTargetLine) return;
      pos.removeItem(editTargetLine.id);
      pos.addItem({
        catalogItemId: editTargetLine.catalogItemId,
        qty: editTargetLine.qty,
        modifiers: editTargetLine.modifiers?.map((m) => ({
          modifierId: m.modifierId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
          isDefault: m.isDefault,
        })) ?? undefined,
        specialInstructions: editTargetLine.specialInstructions ?? undefined,
        selectedOptions: editTargetLine.selectedOptions ?? undefined,
        notes: editTargetLine.notes ?? undefined,
        priceOverride: { unitPrice: 0, reason: `Comp: ${reason}`, approvedBy: user?.name ?? 'manager' },
        _display: { name: editTargetLine.catalogItemName, unitPrice: 0, itemType: editTargetLine.itemType, sku: editTargetLine.catalogItemSku },
      });
      setShowLineCompDialog(false);
      setEditTargetLine(null);
    },
    [editTargetLine, pos, user],
  );

  const handleLineEditModifiers = useCallback(
    (line: OrderLine) => {
      // Find the catalog item to open the modifier dialog
      const item = catalog.allItems.find((i) => i.id === line.catalogItemId);
      if (!item) {
        toast.error('Item not found in catalog — it may have been archived');
        return;
      }
      // Store the line being edited so we can remove it after modifier dialog confirms
      setEditTargetLine(line);
      setModifierItem(item);
    },
    [catalog, toast],
  );

  // Close all portal-based dialogs when this POS mode becomes inactive.
  // Portals render to document.body outside the CSS-hidden container,
  // so they'd remain visible on top of the other POS mode without this.
  useEffect(() => {
    if (!isActive) {
      setShowDiscountDialog(false);
      setShowServiceChargeDialog(false);
      setShowRecallDialog(false);
      setShowTaxExemptDialog(false);
      setShowNewCustomerDialog(false);
      setShowPaymentPicker(false);
      setShowTenderDialog(false);
      setShowVoidConfirm(false);
      setShowShiftEndConfirm(false);
      setShowOpenShiftDialog(false);
      setShowDrawerEventDialog(false);
      setShowReceiptPreview(false);
      setShowReturnDialog(false);
      setShowSplitTender(false);
      setShowGiftCardDialog(false);
      setShowSettings(false);
      setShowQuickMenuEditor(false);
      setShowEmailQuoteDialog(false);
      setShowLinePriceOverride(false);
      setShowLineVoidDialog(false);
      setShowLineCompDialog(false);
      setShowCustomItemDialog(false);
      setShowNotesDialog(false);
      setEditTargetLine(null);
      setCartSelectMode(false);
      setSelectedLineIds(new Set());
      setPosView('order');
      // Guest pay polling paused via pollEnabled={isActive} on the hook
    }
  }, [isActive]);

  // ── Item tap handler ────────────────────────────────────────────

  /** Build _display info from a catalog item for optimistic UI */
  const displayFor = useCallback((item: CatalogItemForPOS) => ({
    name: item.name,
    unitPrice: item.price,
    itemType: item.type,
    sku: item.sku,
  }), []);

  const handleItemTap = useCallback(
    (item: CatalogItemForPOS) => {
      const typeGroup = item.typeGroup;
      switch (typeGroup) {
        case 'fnb': {
          const meta = item.metadata as FnbMetadata | undefined;
          const hasModifiers =
            (meta?.defaultModifierGroupIds && meta.defaultModifierGroupIds.length > 0) ||
            (meta?.optionalModifierGroupIds && meta.optionalModifierGroupIds.length > 0);
          const hasFractions = meta?.allowedFractions && meta.allowedFractions.length > 1;
          if (hasModifiers || hasFractions) {
            setModifierItem(item);
          } else {
            pos.addItem({ catalogItemId: item.id, qty: 1, _display: displayFor(item) });
            catalog.addToRecent(item.id);
          }
          break;
        }
        case 'retail': {
          const meta = item.metadata as RetailMetadata | undefined;
          if (meta?.optionSets && meta.optionSets.length > 0) {
            setOptionItem(item);
          } else {
            pos.addItem({ catalogItemId: item.id, qty: 1, _display: displayFor(item) });
            catalog.addToRecent(item.id);
          }
          break;
        }
        case 'service':
          pos.addItem({ catalogItemId: item.id, qty: 1, _display: displayFor(item) });
          catalog.addToRecent(item.id);
          break;
        case 'package':
          setPackageItem(item);
          break;
      }
    },
    [pos, catalog, displayFor],
  );

  // ── Dialog add handlers ─────────────────────────────────────────

  const handleModifierAdd = useCallback(
    (input: AddLineItemInput) => {
      pos.addItem({
        ...input,
        _display: modifierItem ? displayFor(modifierItem) : undefined,
      });
      if (modifierItem) catalog.addToRecent(modifierItem.id);
      setModifierItem(null);
    },
    [pos, catalog, modifierItem, displayFor],
  );

  // Override modifier add to support re-editing existing lines from cart
  const handleModifierAddWithEdit = useCallback(
    (input: AddLineItemInput) => {
      if (editTargetLine && modifierItem) {
        // Editing an existing line — remove old, add new
        pos.removeItem(editTargetLine.id);
        pos.addItem({
          ...input,
          _display: { name: modifierItem.name, unitPrice: modifierItem.price, itemType: modifierItem.type, sku: modifierItem.sku },
        });
        catalog.addToRecent(modifierItem.id);
        setEditTargetLine(null);
        setModifierItem(null);
      } else {
        // Normal add from catalog
        handleModifierAdd(input);
      }
    },
    [editTargetLine, modifierItem, pos, catalog, handleModifierAdd],
  );

  const handleOptionAdd = useCallback(
    (input: AddLineItemInput) => {
      pos.addItem({
        ...input,
        _display: optionItem ? displayFor(optionItem) : undefined,
      });
      if (optionItem) catalog.addToRecent(optionItem.id);
      setOptionItem(null);
    },
    [pos, catalog, optionItem, displayFor],
  );

  const handlePackageAdd = useCallback(
    (input: AddLineItemInput) => {
      pos.addItem({
        ...input,
        _display: packageItem ? displayFor(packageItem) : undefined,
      });
      if (packageItem) catalog.addToRecent(packageItem.id);
      setPackageItem(null);
    },
    [pos, catalog, packageItem, displayFor],
  );

  // ── Barcode scan feedback ───────────────────────────────────────

  const [scanFeedback, setScanFeedback] = useState<'success' | 'error' | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout>>(0 as unknown as ReturnType<typeof setTimeout>);

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: Event) => {
      const code = (e as CustomEvent).detail as string;
      const item = catalog.lookupByBarcode(code);

      // Clear any pending timer so rapid scans don't overlap
      clearTimeout(scanTimerRef.current);

      if (item) {
        handleItemTap(item);
        toast.success(`Scanned: ${item.name}`);
        setScanFeedback('success');
      } else {
        toast.error(`Item not found: ${code}`);
        setScanFeedback('error');
      }

      // Auto-clear after animation duration
      scanTimerRef.current = setTimeout(() => setScanFeedback(null), 600);
    };
    window.addEventListener('barcode-scan', handler);
    return () => {
      window.removeEventListener('barcode-scan', handler);
      clearTimeout(scanTimerRef.current);
    };
  }, [isActive, catalog, toast, handleItemTap]);

  // ── Initialize offline sync worker ─────────────────────────────
  useEffect(() => { initOfflineSync(); }, []);

  // ── Broadcast order state to customer-facing display ──────────
  useEffect(() => {
    if (!isActive) return;
    customerDisplay.broadcastOrder(pos.currentOrder ?? null);
  }, [isActive, pos.currentOrder, customerDisplay]);

  // ── POS Keyboard Shortcuts ────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    function handleKey(e: KeyboardEvent) {
      // Skip when user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) {
        // Still allow Escape to blur inputs
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }
      switch (e.key) {
        case 'F1':
          e.preventDefault();
          // Focus search bar
          document.querySelector<HTMLInputElement>('[placeholder*="Search items"]')?.focus();
          break;
        case 'F2':
          e.preventDefault();
          if (posRef.current.currentOrder?.lines?.length) {
            setPosView('payment');
          }
          break;
        case 'F3':
          e.preventDefault();
          posRef.current.holdOrder();
          break;
        case 'F4':
          e.preventDefault();
          setShowRecallDialog(true);
          break;
        case 'F5':
          e.preventDefault();
          setShowDiscountDialog(true);
          break;
        case 'F6':
          e.preventDefault();
          if (posPerms.returns) setShowReturnDialog(true);
          break;
        case 'F8':
          e.preventDefault();
          if (posRef.current.currentOrder?.id) setShowVoidConfirm(true);
          break;
        case 'F9':
          e.preventDefault();
          setShowNewCustomerDialog(true);
          break;
        case 'Escape':
          e.preventDefault();
          if (posView === 'payment') {
            setPosView('order');
          }
          break;
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isActive, posView, posPerms.returns]);

  // ── Order actions ───────────────────────────────────────────────

  // Detect F&B items in the current order for Send button highlighting
  const hasFnbItems = useMemo(() => {
    const lines = pos.currentOrder?.lines ?? [];
    return lines.some((l) => l.itemType === 'food' || l.itemType === 'beverage');
  }, [pos.currentOrder?.lines]);

  const isOrderPlaced = pos.currentOrder?.status === 'placed';

  const handleSendOrder = useCallback(async () => {
    try {
      await posRef.current.placeOrder();
      toast.success('Order sent to kitchen');
    } catch {
      // Error already handled by POS hook
    }
  }, [toast]);

  const handlePayClick = useCallback(async () => {
    // Flush any queued batch items and wait for server totals (incl. tax) before
    // showing the payment panel.  Without the await, "Pay Exact" could use a stale
    // pre-tax total from optimistic temp lines.
    try {
      await posRef.current.ensureOrderReady();
    } catch {
      // Order creation failure is non-fatal here — payment panel handles it via
      // its own ensureOrderReady fallback.
    }
    setPosView('payment');
  }, []);

  const handlePrintCheck = useCallback(async () => {
    if (!pos.currentOrder?.id) return;
    try {
      const session = await guestPay.createSession();
      if (session) {
        const url = guestPay.copyLink(session.token);
        toast.success('QR check created — link copied');
        void url; // URL already on clipboard
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create QR check';
      toast.error(message);
    }
  }, [pos.currentOrder?.id, guestPay, toast]);

  const handlePaymentComplete = useCallback(
    (_result: RecordTenderResult) => {
      // Capture order ID BEFORE clearing for receipt print
      const orderId = posRef.current.currentOrder?.id;
      if (orderId) {
        // Fire-and-forget — never block POS on print
        // Uses modern receipt engine which respects custom receipt settings
        apiFetch<{ data: ReceiptDocument }>('/api/v1/receipts/build', {
          method: 'POST',
          body: JSON.stringify({ orderId, variant: 'standard' }),
        })
          .then((res) => printReceiptDocument(res.data))
          .catch(() => {});
      }

      setShowTenderDialog(false);
      setPosView('order');
      setRemainingBalance(null);
      posRef.current.clearOrder();
      registerTabsRef.current.clearActiveTab();
      customerDisplay.broadcastPaymentComplete();
    },
    [customerDisplay],
  );

  const handlePaymentCancel = useCallback(() => {
    setPosView('order');
  }, []);

  const handlePartialPayment = useCallback((remaining: number, _version: number) => {
    setRemainingBalance(remaining);
  }, []);

  const handleSplitComplete = useCallback(() => {
    setShowSplitTender(false);
    setPosView('order');
    setRemainingBalance(null);
    posRef.current.clearOrder();
    registerTabsRef.current.clearActiveTab();
    customerDisplay.broadcastPaymentComplete();
  }, [customerDisplay]);

  const handleGiftCardRedeem = useCallback(
    async (voucherId: string, cardNumber: string, amountCents: number) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast.error('Offline — payments disabled until connection restored');
        return;
      }
      // Ensure the order is created and batched items are flushed
      let orderId = posRef.current.currentOrder?.id;
      if (!orderId) {
        try {
          const ready = await posRef.current.ensureOrderReady();
          orderId = ready.id;
        } catch {
          toast.error('Failed to create order — please try again');
          return;
        }
      }
      if (!orderId) {
        toast.error('Order is still being created — please wait');
        return;
      }

      const order = posRef.current.currentOrder!;
      const locationHeader: Record<string, string> = order.locationId ? { 'X-Location-Id': order.locationId } : {};
      const businessDate = new Date();
      const bDate = `${businessDate.getFullYear()}-${String(businessDate.getMonth() + 1).padStart(2, '0')}-${String(businessDate.getDate()).padStart(2, '0')}`;

      try {
        const res = await apiFetch<{ data: RecordTenderResult }>(
          `/api/v1/orders/${orderId}/place-and-pay`,
          {
            method: 'POST',
            headers: locationHeader,
            body: JSON.stringify({
              clientRequestId: crypto.randomUUID(),
              placeClientRequestId: crypto.randomUUID(),
              orderId,
              tenderType: 'gift_card',
              amountGiven: amountCents,
              tipAmount: 0,
              terminalId: config?.terminalId ?? '',
              employeeId: user?.id ?? '',
              businessDate: bDate,
              shiftId: shift.currentShift?.id ?? undefined,
              posMode: config?.posMode ?? 'retail',
              metadata: { voucherId, cardNumber },
            }),
          },
        );
        const result = res.data;

        if (result.isFullyPaid) {
          toast.success('Gift card payment complete!');
          setShowGiftCardDialog(false);
          setShowTenderDialog(false);
          setPosView('order');
          setRemainingBalance(null);
          posRef.current.clearOrder();
          registerTabsRef.current.clearActiveTab();
          customerDisplay.broadcastPaymentComplete();
        } else {
          toast.info(`Gift card applied. Remaining: $${(result.remainingBalance / 100).toFixed(2)}`);
          setRemainingBalance(result.remainingBalance);
          setShowGiftCardDialog(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Gift card payment failed';
        toast.error(message);
      }
    },
    [config?.terminalId, config?.posMode, user?.id, shift.currentShift?.id, toast],
  );

  const handleSaveTab = useCallback(
    async (tabNumber: number) => {
      // Switch to the tab if not active, then hold its order
      if (tabNumber !== registerTabsRef.current.activeTabNumber) {
        registerTabsRef.current.switchTab(tabNumber);
      }
      await posRef.current.holdOrder();
      registerTabsRef.current.clearActiveTab();
    },
    [],
  );

  const handleHoldOrder = useCallback(async () => {
    setPosView('order');
    await posRef.current.holdOrder();
    registerTabsRef.current.clearActiveTab();
  }, []);

  const handleRecallOrder = useCallback(
    async (orderId: string) => {
      await posRef.current.recallOrder(orderId);
      setShowRecallDialog(false);
    },
    [],
  );

  const handleVoidOrder = useCallback(async () => {
    if (!voidReason.trim()) {
      toast.error('Please provide a void reason');
      return;
    }
    setPosView('order');
    await posRef.current.voidOrder(voidReason.trim());
    registerTabsRef.current.clearActiveTab();
    setVoidReason('');
    setShowVoidConfirm(false);
  }, [voidReason, toast]);

  const handleShiftEnd = useCallback(async (closingCountCents: number, notes?: string) => {
    const result = await shift.closeShift(closingCountCents, notes);
    if (result) {
      setShowShiftEndConfirm(false);
    }
    return result;
  }, [shift]);

  // ── Breadcrumb navigation ───────────────────────────────────────

  const handleBreadcrumbNavigate = useCallback(
    (level: string) => {
      switch (level) {
        case 'department':
          catalog.setSubDepartment(null);
          catalog.setCategory(null);
          break;
        case 'subdepartment':
          catalog.setCategory(null);
          break;
      }
    },
    [catalog],
  );

  // ── Attach customer + auto-rename tab ──────────────────────────
  const handleAttachCustomer = useCallback(
    (customerId: string, customerName?: string) => {
      posRef.current.attachCustomer(customerId, customerName);
      if (customerName) {
        const parts = customerName.trim().split(/\s+/);
        const shortName =
          parts.length >= 2
            ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}`
            : parts[0] ?? '';
        registerTabsRef.current.renameTab(registerTabsRef.current.activeTabNumber, shortName);
      }
    },
    [],
  );

  // ── Detach customer + clear tab label ─────────────────────────
  const handleDetachCustomer = useCallback(() => {
    posRef.current.detachCustomer();
    registerTabsRef.current.renameTab(registerTabsRef.current.activeTabNumber, '');
  }, []);

  // ── Universal search handlers ──────────────────────────────────
  const handleSearchItemSelect = useCallback(
    (item: CatalogItemForPOS) => {
      handleItemTap(item);
    },
    [handleItemTap],
  );

  const handleSearchCustomerSelect = useCallback(
    (customerId: string, customerName: string) => {
      handleAttachCustomer(customerId, customerName);
    },
    [handleAttachCustomer],
  );

  const handleSearchHeldOrderSelect = useCallback(
    (orderId: string) => {
      pos.recallOrder(orderId).catch(() => {});
    },
    [pos],
  );

  // ── Quick Menu pages from localStorage ──────────────────────────
  const quickMenuPages = useMemo<QuickMenuPage[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`pos_quick_menu_${locationId}`);
      return raw ? (JSON.parse(raw) as QuickMenuPage[]) : [];
    } catch {
      return [];
    }
    // Re-read after editor closes
  }, [locationId, showQuickMenuEditor]);

  // ── Items to display ────────────────────────────────────────────

  // Show recent items as default view when no department is selected,
  // no search query, and there are recent items available
  const showRecentDefault =
    viewMode === 'catalog' &&
    !catalog.searchQuery.trim() &&
    !catalog.nav.departmentId &&
    catalog.recentItems.length > 0;

  const displayItems = useMemo(() => {
    if (catalog.searchQuery.trim()) {
      return catalog.searchResults;
    }
    if (showRecentDefault) {
      return catalog.recentItems;
    }
    return catalog.currentItems;
  }, [catalog.searchQuery, catalog.searchResults, catalog.currentItems, catalog.recentItems, showRecentDefault]);

  // ── Loading state ───────────────────────────────────────────────

  if (configLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" label="Loading Retail POS..." />
      </div>
    );
  }

  const hasItems = pos.currentOrder?.lines && pos.currentOrder.lines.length > 0;
  const orderNumber = pos.currentOrder?.orderNumber ?? null;

  // ── Layout config (from profit center or defaults) ────────────
  const layoutSplit = config?.layout?.splitRatio ?? 60;
  const leftPct = `${Math.min(80, Math.max(50, layoutSplit))}%`;
  const rightPct = `${100 - Math.min(80, Math.max(50, layoutSplit))}%`;

  return (
    <div className="flex h-full flex-col">
      {/* ── Register Tabs ────────────────────────────────────────────── */}
      <RegisterTabs
        tabs={registerTabs.tabs}
        activeTabNumber={registerTabs.activeTabNumber}
        onSwitchTab={registerTabs.switchTab}
        onAddTab={registerTabs.addTab}
        onCloseTab={registerTabs.closeTab}
        onRenameTab={registerTabs.renameTab}
        orderLabels={orderLabels}
        customerId={pos.currentOrder?.customerId ?? null}
        onAttachCustomer={handleAttachCustomer}
        onDetachCustomer={handleDetachCustomer}
        onSaveTab={handleSaveTab}
        onChangeServer={registerTabs.changeServer}
        onViewProfile={(id) => profileDrawer.open(id, { source: 'pos' })}
        onAddNewCustomer={() => setShowNewCustomerDialog(true)}
      />

      {/* ── Main Content Area ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT PANEL ──────────────────────────────────────────── */}
        <div
          className={`relative flex shrink flex-col border-r border-border bg-surface ${posView === 'payment' ? 'pointer-events-none' : ''}`}
          style={{ width: leftPct, minWidth: 0 }}
        >
          {/* Dim overlay when in payment mode */}
          {posView === 'payment' && (
            <div className="absolute inset-0 z-10 bg-black/5" />
          )}
          {/* Search bar — flashes green/red on barcode scan */}
          <div className={`shrink-0 border-b border-border px-4 py-3 ${
            scanFeedback === 'success' ? 'scan-flash-success' :
            scanFeedback === 'error' ? 'scan-flash-error' : ''
          }`}>
            <POSSearchBar
              onItemSelect={handleSearchItemSelect}
              onCustomerSelect={handleSearchCustomerSelect}
              onHeldOrderSelect={handleSearchHeldOrderSelect}
              allItems={catalog.allItems}
            />
          </div>

          {/* View mode toggle: Catalog vs Quick Menu */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
            <button
              type="button"
              onClick={() => setViewMode('catalog')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'catalog'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              All Items
            </button>
            <button
              type="button"
              onClick={() => setViewMode('quick')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'quick'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              Hot Sellers
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tools')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'tools'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              <Wrench aria-hidden="true" className="h-3.5 w-3.5" />
              Tools
            </button>

            {/* Spacer + Grid/List toggle */}
            <div className="flex-1" />
            <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              <button
                type="button"
                onClick={() => handleCatalogViewModeChange('grid')}
                className={`rounded-md p-1.5 transition-colors ${
                  catalogViewMode === 'grid'
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCatalogViewModeChange('list')}
                className={`rounded-md p-1.5 transition-colors ${
                  catalogViewMode === 'list'
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {viewMode === 'tools' ? (
            /* ── Tools View ─────────────────────────────────────────── */
            <div className="flex-1 overflow-hidden">
              <ToolsView
                locationId={locationId}
                terminalId={config?.terminalId ?? ''}
                onRecallSavedTab={async (orderId) => {
                  await pos.recallOrder(orderId);
                  setViewMode('catalog');
                }}
                onTransferTab={async (orderId) => {
                  const order = await pos.fetchOrder(orderId);
                  pos.setOrder(order);
                  setViewMode('catalog');
                }}
                onItemCreated={() => catalog.refresh()}
                isLoading={pos.isLoading}
              />
            </div>
          ) : viewMode === 'quick' ? (
            /* ── Hot Sellers View ───────────────────────────────────── */
            <div className="flex-1 overflow-y-auto p-4">
              {catalog.isLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <LoadingSpinner size="md" label="Loading items..." />
                </div>
              ) : quickMenuPages.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {/* Edit button for custom grid */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowQuickMenuEditor(true)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil aria-hidden="true" className="h-3 w-3" />
                      Edit Grid
                    </button>
                  </div>
                  <QuickMenuGrid
                    pages={quickMenuPages}
                    allItems={catalog.allItems}
                    onItemTap={handleItemTap}
                    onCategoryTap={(categoryId) => {
                      catalog.setCategory(categoryId);
                      setViewMode('catalog');
                    }}
                    onAction={(action) => {
                      if (action === 'open_drawer') shift.openDrawer();
                      else if (action === 'no_sale') shift.recordNoSale();
                      else if (action === 'hold_order') handleHoldOrder();
                      else if (action === 'recall_order') setShowRecallDialog(true);
                      else if (action === 'discount') setShowDiscountDialog(true);
                    }}
                  />
                </div>
              ) : (
                <QuickMenuTab
                  favorites={catalog.favorites}
                  recentItems={catalog.recentItems}
                  onItemTap={handleItemTap}
                  activeTab={quickMenuTab}
                  onTabChange={setQuickMenuTab}
                  itemSize="normal"
                  isFavorite={catalog.isFavorite}
                  onToggleFavorite={catalog.toggleFavorite}
                  canEditItem={canEditItem}
                  onEditItem={handleEditItem}
                  onArchiveItem={handleArchiveItem}
                  onViewHistory={handleViewHistory}
                />
              )}
            </div>
          ) : (
            /* ── Catalog View ──────────────────────────────────────── */
            <>
              {/* Department tabs */}
              <div className="shrink-0 border-b border-border px-4 py-2">
                <DepartmentTabs
                  departments={catalog.departments}
                  selectedId={catalog.nav.departmentId}
                  onSelect={catalog.setDepartment}
                  size="normal"
                />
              </div>

              {/* Sub-department tabs (conditional) */}
              {catalog.currentSubDepartments.length > 0 && (
                <div className="shrink-0 border-b border-border px-4 py-2">
                  <SubDepartmentTabs
                    departments={catalog.currentSubDepartments}
                    selectedId={catalog.nav.subDepartmentId}
                    onSelect={catalog.setSubDepartment}
                    size="normal"
                  />
                </div>
              )}

              {/* Breadcrumb */}
              {catalog.breadcrumb.length > 0 && (
                <div className="shrink-0 px-4 py-2">
                  <CatalogBreadcrumb
                    breadcrumb={catalog.breadcrumb}
                    onNavigate={handleBreadcrumbNavigate}
                  />
                </div>
              )}

              {/* Two-column body: CategoryRail + Items Grid */}
              <div className="flex flex-1 overflow-hidden">
                {/* Category rail (when categories exist) */}
                {catalog.currentCategories.length > 0 && (
                  <CategoryRail
                    categories={catalog.currentCategories}
                    selectedId={catalog.nav.categoryId}
                    onSelect={catalog.setCategory}
                  />
                )}

                {/* Items grid */}
                <div ref={itemGridScrollRef} className="flex-1 overflow-y-auto p-4">
                  {catalog.isLoading ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <LoadingSpinner size="md" label="Loading items..." />
                    </div>
                  ) : (
                    <>
                      {catalog.searchQuery.trim() && (
                        <p className="mb-3 text-sm text-muted-foreground">
                          {displayItems.length} result{displayItems.length !== 1 ? 's' : ''}{' '}
                          for &ldquo;{catalog.searchQuery}&rdquo;
                        </p>
                      )}

                      {/* Recent items header when showing default view */}
                      {showRecentDefault && (
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-medium text-muted-foreground">
                            <History aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                            Recent Items
                          </p>
                          <button
                            type="button"
                            onClick={() => catalog.setDepartment(catalog.departments[0]?.id ?? null)}
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                          >
                            View All Items
                          </button>
                        </div>
                      )}

                      {displayItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                          <p className="text-sm text-muted-foreground">
                            {catalog.searchQuery.trim()
                              ? 'No items match your search'
                              : 'No items in this category'}
                          </p>
                        </div>
                      ) : catalogViewMode === 'list' ? (
                        <div className="divide-y divide-border">
                          {displayItems.map((item) => (
                            <ItemListRow key={item.id} item={item} onTap={handleItemTap} />
                          ))}
                        </div>
                      ) : (
                        <VirtualItemGrid
                          items={displayItems}
                          onItemTap={handleItemTap}
                          scrollRef={itemGridScrollRef}
                          size="normal"
                          minColumnWidth={130}
                          isFavorite={catalog.isFavorite}
                          onToggleFavorite={catalog.toggleFavorite}
                          canEditItem={canEditItem}
                          onEditItem={handleEditItem}
                          onArchiveItem={handleArchiveItem}
                          onViewHistory={handleViewHistory}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
        <div className="flex min-w-[320px] flex-col bg-surface" style={{ width: rightPct }}>
          {posView === 'payment' && pos.currentOrder && config ? (
            /* ── PAYMENT VIEW ──────────────────────────────────────── */
            <PaymentPanel
              order={pos.currentOrder}
              config={config}
              shiftId={shift.currentShift?.id}
              onPaymentComplete={handlePaymentComplete}
              onCancel={handlePaymentCancel}
              ensureOrderReady={pos.ensureOrderReady}
            />
          ) : (
            /* ── ORDER VIEW (Cart + actions) ───────────────────────── */
            <>
              {/* Customer attachment */}
              <div className="shrink-0 border-b border-border px-4 py-3">
                <CustomerAttachment
                  customerId={pos.currentOrder?.customerId ?? null}
                  customerName={pos.currentOrder?.customerName ?? null}
                  onAttach={handleAttachCustomer}
                  onDetach={handleDetachCustomer}
                  onViewProfile={(id) => profileDrawer.open(id, { source: 'pos' })}
                />
              </div>

              {/* Cart */}
              <div className="flex-1 overflow-hidden">
                <Cart
                  order={pos.currentOrder}
                  onRemoveItem={pos.removeItem}
                  onUpdateLineNote={pos.updateLineNote}
                  label={orderNumber ? `Cart #${orderNumber}` : 'Cart'}
                  selectMode={cartSelectMode}
                  selectedLineIds={selectedLineIds}
                  onToggleSelect={toggleLineSelect}
                  onToggleSelectMode={toggleCartSelectMode}
                  onBatchRemove={handleBatchRemove}
                  onBatchDiscount={handleBatchDiscount}
                  onPriceOverride={handleLinePriceOverride}
                  onEditModifiers={handleLineEditModifiers}
                  onVoidLine={handleLineVoid}
                  onCompLine={handleLineComp}
                  permissions={{
                    priceOverride: posPerms.priceOverride,
                    discount: posPerms.discount,
                    voidLine: posPerms.voidOrder,
                    comp: posPerms.voidOrder,
                  }}
                />
              </div>

              {/* Cart totals */}
              <CartTotals order={pos.currentOrder} />

              {/* Suggested items strip (upsell) */}
              {pos.currentOrder && pos.currentOrder.lines && pos.currentOrder.lines.length > 0 && (
                <SuggestedItemsStrip
                  allItems={catalog.allItems}
                  orderLines={pos.currentOrder.lines}
                  onItemTap={handleItemTap}
                />
              )}

              {/* Action buttons: Discount + Charges + Tax Exempt (permission-gated) */}
              <div className="shrink-0 border-t border-border px-4 py-2">
                <div className="flex gap-2">
                  {posPerms.discount && (
                    <button
                      type="button"
                      onClick={() => setShowDiscountDialog(true)}
                      disabled={!hasItems}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <DollarSign aria-hidden="true" className="h-4 w-4" />
                      Discount
                    </button>
                  )}
                  {posPerms.serviceCharge && (
                    <button
                      type="button"
                      onClick={() => setShowServiceChargeDialog(true)}
                      disabled={!hasItems}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Receipt aria-hidden="true" className="h-4 w-4" />
                      Service Charge
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (pos.currentOrder?.taxExempt) {
                        pos.setTaxExempt(false);
                      } else {
                        setShowTaxExemptDialog(true);
                      }
                    }}
                    disabled={!hasItems}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      pos.currentOrder?.taxExempt
                        ? 'border-purple-500/30 bg-purple-500/10 text-purple-500 hover:bg-purple-500/10'
                        : 'border-border text-foreground hover:bg-accent'
                    }`}
                  >
                    <ShieldOff aria-hidden="true" className="h-4 w-4" />
                    {pos.currentOrder?.taxExempt ? 'Tax Exempt ✓' : 'Tax Exempt'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNotesDialog(true)}
                    disabled={!pos.currentOrder}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      pos.currentOrder?.notes
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/10'
                        : 'border-border text-foreground hover:bg-accent'
                    }`}
                  >
                    <StickyNote aria-hidden="true" className="h-4 w-4" />
                    {pos.currentOrder?.notes ? 'Notes ✓' : 'Notes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGiftCardDialog(true)}
                    disabled={!hasItems}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Gift aria-hidden="true" className="h-4 w-4" />
                    Gift Card
                  </button>
                </div>
              </div>

              {/* Guest Pay active banner */}
              {guestPay.hasActive && guestPay.session && (
                <div className="shrink-0 border-t border-border bg-emerald-500/10 px-4 py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-emerald-500">
                      <QrCode aria-hidden="true" className="h-4 w-4" />
                      <span className="font-medium">QR Check Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          guestPay.copyLink(guestPay.session!.token);
                          toast.success('Link copied to clipboard');
                        }}
                        className="flex items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/10"
                      >
                        <Copy aria-hidden="true" className="h-3 w-3" />
                        Copy Link
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Send + QR + Pay buttons */}
              <div className="relative shrink-0 px-4 py-2">
                <div className="flex gap-2">
                  {/* Send button — hidden when KDS routing mode excludes retail */}
                  {kdsSendEnabled && (
                    <button
                      type="button"
                      onClick={handleSendOrder}
                      disabled={!hasItems || isOrderPlaced}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed ${
                        hasFnbItems && hasItems && !isOrderPlaced
                          ? 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-300'
                          : 'border border-border text-foreground hover:bg-accent disabled:opacity-40'
                      }`}
                    >
                      <Send aria-hidden="true" className="h-4 w-4" />
                      {isOrderPlaced ? 'Sent' : 'Send'}
                    </button>
                  )}

                  {/* Print Check button */}
                  <button
                    type="button"
                    onClick={handlePrintCheck}
                    disabled={!hasItems}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-base font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Printer aria-hidden="true" className="h-4 w-4" />
                    Print
                  </button>

                  {/* Pay button — always clickable when items exist. ensureOrderReady
                      drains pending batches when tapped, so there's no artificial delay. */}
                  <button
                    type="button"
                    onClick={handlePayClick}
                    disabled={!hasItems}
                    className="flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    Pay
                    {(remainingBalance ?? pos.currentOrder?.total) ? (
                      <span className="ml-1">{formatMoney(remainingBalance ?? pos.currentOrder?.total ?? 0)}</span>
                    ) : null}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Hold / Recall / Void row */}
          <div className="shrink-0 border-t border-border px-4 py-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleHoldOrder}
                disabled={!hasItems}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Pause aria-hidden="true" className="h-4 w-4" />
                Hold
              </button>
              <button
                type="button"
                onClick={() => setShowRecallDialog(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                <History aria-hidden="true" className="h-4 w-4" />
                Recall
                {pos.heldOrderCount > 0 && (
                  <Badge variant="indigo" className="ml-1 text-[10px]">
                    {pos.heldOrderCount}
                  </Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowEmailQuoteDialog(true)}
                disabled={!hasItems}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Mail aria-hidden="true" className="h-4 w-4" />
                Email
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (posPerms.voidOrder) {
                    setShowVoidConfirm(true);
                  } else {
                    const result = await managerOverride.requestOverride('Void Order', 'orders.void');
                    if (result.verified) {
                      setShowVoidConfirm(true);
                    }
                  }
                }}
                disabled={!pos.currentOrder}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-2 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Ban aria-hidden="true" className="h-4 w-4" />
                Void
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer Action Bar ────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-muted px-4 py-3">
        {posPerms.cashDrawer && (
          <button
            type="button"
            onClick={() => shift.openDrawer()}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            <Unlock aria-hidden="true" className="h-5 w-5" />
            Drawer
          </button>
        )}
        {posPerms.cashDrawer && (
          <button
            type="button"
            onClick={() => shift.recordNoSale()}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            <XCircle aria-hidden="true" className="h-5 w-5" />
            No Sale
          </button>
        )}
        {posPerms.cashDrawer && (
          <button
            type="button"
            onClick={() => setShowDrawerEventDialog(true)}
            disabled={!shift.isOpen}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            <Banknote aria-hidden="true" className="h-5 w-5" />
            Cash Mgmt
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowReceiptPreview(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
        >
          <Printer aria-hidden="true" className="h-5 w-5" />
          Reprint
        </button>
        {posPerms.returns && (
          <button
            type="button"
            onClick={() => setShowReturnDialog(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent"
            style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          >
            <RotateCcw aria-hidden="true" className="h-5 w-5" />
            Return
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowCustomItemDialog(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
        >
          <PlusCircle aria-hidden="true" className="h-5 w-5" />
          Custom Item
        </button>

        {/* Offline sync badge (only visible when there are pending transactions) */}
        <OfflineSyncBadge />

        {/* Settings */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-accent"
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          title="POS Settings"
        >
          <Settings className="h-5 w-5" />
          Settings
        </button>

        {/* Customer Display */}
        <button
          type="button"
          onClick={() => customerDisplay.openDisplay()}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 font-medium transition-colors ${
            customerDisplay.isDisplayOpen()
              ? 'border-green-500/30 text-green-500 hover:bg-green-500/10'
              : 'border-border bg-surface text-muted-foreground hover:bg-accent'
          }`}
          style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
          title="Open Customer Display"
        >
          <Monitor aria-hidden="true" className="h-5 w-5" />
          Display
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Shift indicator + end */}
        {shift.isOpen ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-500">Shift Open</span>
            </span>
            {posPerms.shiftManage && (
              <button
                type="button"
                onClick={() => setShowShiftEndConfirm(true)}
                className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2.5 font-medium text-red-500 transition-colors hover:bg-red-500/10"
                style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
              >
                <LogOut aria-hidden="true" className="h-5 w-5" />
                End Shift
              </button>
            )}
          </div>
        ) : (
          posPerms.shiftManage && (
            <button
              type="button"
              onClick={() => setShowOpenShiftDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-green-700"
              style={{ fontSize: 'calc(0.875rem * var(--pos-font-scale, 1))' }}
            >
              <LogIn aria-hidden="true" className="h-5 w-5" />
              Open Shift
            </button>
          )
        )}
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────── */}

      {/* Modifier Dialog (F&B items + edit modifiers from cart) */}
      <ModifierDialog
        open={modifierItem !== null}
        onClose={() => {
          setModifierItem(null);
          setEditTargetLine(null); // Clear edit target when closing without saving
        }}
        item={modifierItem}
        onAdd={handleModifierAddWithEdit}
      />

      {/* Option Picker Dialog (Retail items with options) */}
      <OptionPickerDialog
        open={optionItem !== null}
        onClose={() => setOptionItem(null)}
        item={optionItem}
        onAdd={handleOptionAdd}
      />

      {/* Package Confirm Dialog — V1 simplified inline */}
      {packageItem !== null && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setPackageItem(null)} />
            <div className="relative w-full max-w-md rounded-lg bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {packageItem.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setPackageItem(null)}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-muted-foreground">
                  Package price: <span className="font-semibold">{formatMoney(packageItem.price)}</span>
                </p>
                {packageItem.metadata &&
                  (packageItem.metadata as { packageComponents?: Array<{ itemName: string; qty: number }> }).packageComponents && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-foreground">Includes:</p>
                      <ul className="mt-1 space-y-1">
                        {((packageItem.metadata as { packageComponents?: Array<{ itemName: string; qty: number }> }).packageComponents ?? []).map(
                          (comp, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground">
                              {comp.qty}x {comp.itemName}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
              </div>
              <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => setPackageItem(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handlePackageAdd({ catalogItemId: packageItem.id, qty: 1 })
                  }
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Custom Item Dialog */}
      {showCustomItemDialog && typeof document !== 'undefined' &&
        createPortal(
          <CustomItemPortal
            allItems={catalog.allItems}
            onAdd={(miscItem, name, priceCents, qty) => {
              pos.addItem({
                catalogItemId: miscItem.id,
                qty,
                priceOverride: { unitPrice: priceCents, reason: `Custom: ${name}`, approvedBy: user?.id ?? 'pos' },
                notes: name,
                _display: { name, unitPrice: priceCents, itemType: miscItem.type, sku: 'MISC' },
              });
              setShowCustomItemDialog(false);
            }}
            onClose={() => setShowCustomItemDialog(false)}
          />,
          document.body,
        )}

      {/* Transaction Notes Dialog */}
      {showNotesDialog && pos.currentOrder && typeof document !== 'undefined' &&
        createPortal(
          <TransactionNotesPortal
            orderId={pos.currentOrder.id}
            initialNotes={pos.currentOrder.notes ?? ''}
            onSave={(notes) => {
              pos.setOrder({ ...pos.currentOrder!, notes: notes || null });
              setShowNotesDialog(false);
            }}
            onClose={() => setShowNotesDialog(false)}
          />,
          document.body,
        )}

      {/* Discount Dialog */}
      <DiscountDialog
        open={showDiscountDialog}
        onClose={() => setShowDiscountDialog(false)}
        subtotalCents={pos.currentOrder?.subtotal ?? 0}
        onApplyDiscount={(type, value, reason) => pos.applyDiscount(type, value, reason)}
      />

      {/* Service Charge Dialog */}
      <ServiceChargeDialog
        open={showServiceChargeDialog}
        onClose={() => setShowServiceChargeDialog(false)}
        subtotalCents={pos.currentOrder?.subtotal ?? 0}
        onAddCharge={(charge) => pos.addServiceCharge(charge)}
      />

      {/* Recall Dialog */}
      <RecallDialog
        open={showRecallDialog}
        onClose={() => setShowRecallDialog(false)}
        onRecall={handleRecallOrder}
        heldOrderCount={pos.heldOrderCount}
      />

      {/* Void Confirm Dialog */}
      {showVoidConfirm && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowVoidConfirm(false)} />
            <div className="relative w-full max-w-sm rounded-lg bg-surface shadow-xl">
              <div className="border-b border-border px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold text-foreground">Void Order</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This will void order {pos.currentOrder?.orderNumber}. This action cannot be undone.
                </p>
              </div>
              <div className="px-6 py-4">
                <label htmlFor="void-reason" className="block text-sm font-medium text-foreground">
                  Reason
                </label>
                <input
                  id="void-reason"
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g., Customer changed mind"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setVoidReason('');
                    setShowVoidConfirm(false);
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVoidOrder}
                  disabled={!voidReason.trim()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Void Order
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Close Shift Dialog */}
      <CloseShiftDialog
        open={showShiftEndConfirm}
        onClose={() => setShowShiftEndConfirm(false)}
        onCloseShift={handleShiftEnd}
        openingBalanceCents={shift.currentShift?.openingBalance ?? 0}
      />

      {/* Open Shift Dialog */}
      <OpenShiftDialog
        open={showOpenShiftDialog}
        onClose={() => setShowOpenShiftDialog(false)}
        onOpen={(balanceCents, changeFundCents) => {
          shift.openShift(balanceCents, changeFundCents);
          setShowOpenShiftDialog(false);
        }}
      />

      {/* Drawer Event Dialog (Paid In/Out, Cash Drop, No Sale) */}
      <DrawerEventDialog
        open={showDrawerEventDialog}
        onClose={() => setShowDrawerEventDialog(false)}
        onRecord={async (eventType, amountCents, reason, bagId, sealNumber) => {
          if (eventType === 'cash_drop') {
            await shift.recordCashDrop(amountCents, reason, bagId, sealNumber);
          } else {
            await shift.recordEvent(eventType, amountCents, reason);
          }
        }}
      />

      {/* Tender Dialog (Cash / Voucher / Check) */}
      {pos.currentOrder && config && (
        <TenderDialog
          open={showTenderDialog}
          onClose={() => setShowTenderDialog(false)}
          order={pos.currentOrder}
          config={config}
          tenderType={selectedTenderType}
          shiftId={shift.currentShift?.id}
          onPaymentComplete={handlePaymentComplete}
          onPartialPayment={handlePartialPayment}
          ensureOrderReady={pos.ensureOrderReady}
        />
      )}

      {/* Tax Exempt Dialog */}
      <TaxExemptDialog
        open={showTaxExemptDialog}
        onClose={() => setShowTaxExemptDialog(false)}
        onConfirm={(reason) => {
          pos.setTaxExempt(true, reason);
          setShowTaxExemptDialog(false);
        }}
      />

      {/* New Customer Dialog */}
      <NewCustomerDialog
        open={showNewCustomerDialog}
        onClose={() => setShowNewCustomerDialog(false)}
        onCreated={(customerId, displayName) => {
          setShowNewCustomerDialog(false);
          handleAttachCustomer(customerId, displayName);
          toast.success(`Customer "${displayName}" created and attached`);
        }}
      />

      {/* Receipt Reprint Dialog */}
      <ReceiptPreviewDialog
        open={showReceiptPreview}
        onClose={() => setShowReceiptPreview(false)}
        locationId={locationId}
        locationName={locations[0]?.name ?? 'Store'}
      />

      {/* Return Dialog */}
      <ReturnDialog
        open={showReturnDialog}
        onClose={() => setShowReturnDialog(false)}
        onComplete={() => toast.success('Return processed successfully')}
      />

      {/* Manager PIN Override Modal */}
      <ManagerPinModal
        open={managerOverride.showPinModal}
        onClose={managerOverride.closePinModal}
        onVerify={managerOverride.verifyPin}
        error={managerOverride.pinError}
        title={managerOverride.pendingAction ? `Manager Override: ${managerOverride.pendingAction}` : 'Manager Override'}
      />

      {/* Line-level Price Override Dialog */}
      <PriceOverrideDialog
        open={showLinePriceOverride}
        onClose={() => {
          setShowLinePriceOverride(false);
          setEditTargetLine(null);
        }}
        itemName={editTargetLine?.catalogItemName ?? ''}
        currentPrice={editTargetLine?.unitPrice ?? 0}
        onApply={handleLinePriceOverrideApply}
      />

      {/* Line-level Void Dialog */}
      <VoidLineDialog
        open={showLineVoidDialog}
        onClose={() => {
          setShowLineVoidDialog(false);
          setEditTargetLine(null);
        }}
        onVoid={handleLineVoidConfirm}
        itemName={editTargetLine?.catalogItemName}
        amountCents={editTargetLine?.lineTotal}
      />

      {/* Line-level Comp Dialog */}
      <CompDialog
        open={showLineCompDialog}
        onClose={() => {
          setShowLineCompDialog(false);
          setEditTargetLine(null);
        }}
        onComp={handleLineCompConfirm}
        itemName={editTargetLine?.catalogItemName}
        amountCents={editTargetLine?.lineTotal}
      />

      {/* Split Tender Panel */}
      {pos.currentOrder && config && (
        <SplitTenderPanel
          open={showSplitTender}
          order={pos.currentOrder}
          config={config}
          shiftId={shift.currentShift?.id}
          onComplete={handleSplitComplete}
          onCancel={() => setShowSplitTender(false)}
        />
      )}

      {/* Gift Card Tender Dialog */}
      <GiftCardTenderDialog
        open={showGiftCardDialog}
        onClose={() => setShowGiftCardDialog(false)}
        onRedeem={handleGiftCardRedeem}
        remainingBalanceCents={remainingBalance ?? pos.currentOrder?.total ?? 0}
      />

      {/* POS Settings Panel */}
      {config && (
        <POSSettingsPanel
          open={showSettings}
          onClose={() => setShowSettings(false)}
          config={config}
          onConfigChange={setConfig}
          onOpenQuickMenuEditor={() => {
            setShowSettings(false);
            setShowQuickMenuEditor(true);
          }}
        />
      )}

      {/* Quick Menu Editor */}
      <QuickMenuEditor
        open={showQuickMenuEditor}
        onClose={() => setShowQuickMenuEditor(false)}
        locationId={locationId}
        allItems={catalog.allItems}
      />

      {/* Email Quote Dialog */}
      {pos.currentOrder && (
        <EmailQuoteDialog
          open={showEmailQuoteDialog}
          onClose={() => setShowEmailQuoteDialog(false)}
          orderId={pos.currentOrder.id}
          businessName={tenant?.name ?? 'Our Business'}
        />
      )}
    </div>
  );
}

export default memo(RetailPOSPage);
