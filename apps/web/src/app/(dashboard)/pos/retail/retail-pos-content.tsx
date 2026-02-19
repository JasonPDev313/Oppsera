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
  LogOut,
  X,
  Banknote,
  CreditCard,
  Ticket,
  FileText,
  Split,
  Wrench,
  Send,
  ShieldOff,
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
import { SearchInput } from '@/components/ui/search-input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Cart } from '@/components/pos/Cart';
import { CartTotals } from '@/components/pos/CartTotals';
import { VirtualItemGrid } from '@/components/pos/VirtualItemGrid';
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
import { useItemEditDrawer } from '@/components/inventory/ItemEditDrawerContext';

// TenderDialog + ConfirmDialog are critical POS infrastructure — static imports for instant open
import { TenderDialog } from '@/components/pos/TenderDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
// Lazy-loaded dialogs — infrequently used, reduces initial bundle
const ModifierDialog = dynamic(() => import('@/components/pos/ModifierDialog').then(m => ({ default: m.ModifierDialog })), { ssr: false });
const OptionPickerDialog = dynamic(() => import('@/components/pos/OptionPickerDialog').then(m => ({ default: m.OptionPickerDialog })), { ssr: false });
const TaxExemptDialog = dynamic(() => import('@/components/pos/TaxExemptDialog').then(m => ({ default: m.TaxExemptDialog })), { ssr: false });
const NewCustomerDialog = dynamic(() => import('@/components/pos/NewCustomerDialog').then(m => ({ default: m.NewCustomerDialog })), { ssr: false });
const ToolsView = dynamic(() => import('@/components/pos/ToolsView').then(m => ({ default: m.ToolsView })), { ssr: false });
const DiscountDialog = dynamic(() => import('@/components/pos/DiscountDialog').then(m => ({ default: m.DiscountDialog })), { ssr: false });
const ServiceChargeDialog = dynamic(() => import('@/components/pos/ServiceChargeDialog').then(m => ({ default: m.ServiceChargeDialog })), { ssr: false });
import type { CatalogItemForPOS, AddLineItemInput, HeldOrder, RecordTenderResult } from '@/types/pos';
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
        <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recall Order</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              {heldOrderCount} held {heldOrderCount === 1 ? 'order' : 'orders'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
          {heldOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <History className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                No held orders found for this terminal
              </p>
              <p className="mt-1 text-xs text-gray-400">
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
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {held.orderNumber}
                    </p>
                    <p className="text-xs text-gray-500">
                      {held.itemCount} {held.itemCount === 1 ? 'item' : 'items'} &middot;{' '}
                      {held.heldBy}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatMoney(held.total)}
                    </p>
                    <p className="text-xs text-gray-400">
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
        <div className="flex justify-end border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Retail POS Page ───────────────────────────────────────────────

function RetailPOSPage({ isActive = true }: { isActive?: boolean }) {
  const { locations, user } = useAuthContext();
  const { isModuleEnabled } = useEntitlementsContext();
  const { toast } = useToast();
  const canEditItem = isModuleEnabled('catalog');
  const itemGridScrollRef = useRef<HTMLDivElement>(null);

  // Location
  const locationId = locations[0]?.id ?? '';

  // Hooks
  const { config, isLoading: configLoading } = usePOSConfig(locationId, 'retail');
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
    (itemId: string) => {
      toast.info('Archive coming soon — use Edit Item to manage inventory');
    },
    [toast],
  );

  // ── View state ──────────────────────────────────────────────────

  type ViewMode = 'catalog' | 'quick' | 'tools';
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [quickMenuTab, setQuickMenuTab] = useState<'favorites' | 'recent'>('favorites');

  // ── Dialog state ────────────────────────────────────────────────

  const [modifierItem, setModifierItem] = useState<CatalogItemForPOS | null>(null);
  const [optionItem, setOptionItem] = useState<CatalogItemForPOS | null>(null);
  const [packageItem, setPackageItem] = useState<CatalogItemForPOS | null>(null);

  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showServiceChargeDialog, setShowServiceChargeDialog] = useState(false);
  const [showRecallDialog, setShowRecallDialog] = useState(false);
  const [showTaxExemptDialog, setShowTaxExemptDialog] = useState(false);
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false);

  // Payment flow
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showTenderDialog, setShowTenderDialog] = useState(false);
  const [selectedTenderType, setSelectedTenderType] = useState<'cash' | 'check' | 'voucher'>('cash');
  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);

  // Confirm dialogs
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [showShiftEndConfirm, setShowShiftEndConfirm] = useState(false);
  const [voidReason, setVoidReason] = useState('');

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

  // ── Barcode scan handler ────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: Event) => {
      const code = (e as CustomEvent).detail as string;
      const item = catalog.lookupByBarcode(code);
      if (item) {
        handleItemTap(item);
        toast.success(`Scanned: ${item.name}`);
      } else {
        toast.error(`Item not found: ${code}`);
      }
    };
    window.addEventListener('barcode-scan', handler);
    return () => window.removeEventListener('barcode-scan', handler);
  }, [isActive, catalog, toast, handleItemTap]);

  // ── Order actions ───────────────────────────────────────────────

  // Detect F&B items in the current order for Send button highlighting
  const hasFnbItems = useMemo(() => {
    const lines = pos.currentOrder?.lines ?? [];
    return lines.some((l) => l.itemType === 'food' || l.itemType === 'beverage');
  }, [pos.currentOrder?.lines]);

  const isOrderPlaced = pos.currentOrder?.status === 'placed';

  const handleSendOrder = useCallback(async () => {
    try {
      await pos.placeOrder();
      toast.success('Order sent to kitchen');
    } catch {
      // Error already handled by POS hook
    }
  }, [pos, toast]);

  const handlePayClick = useCallback(() => {
    setShowPaymentPicker(true);
    // Start placeOrder early — gives it the full time while user picks payment method.
    // placeOrder deduplicates internally, so TenderDialog's preemptive call safely reuses this.
    if (pos.currentOrder && pos.currentOrder.status !== 'placed') {
      pos.placeOrder().catch(() => {});
    }
  }, [pos]);

  const handlePaymentMethod = useCallback(
    (method: string) => {
      setShowPaymentPicker(false);
      if (method === 'credit_debit') {
        toast.info('Credit/Debit card payments coming soon');
        return;
      }
      if (method === 'split') {
        toast.info('Split payment coming soon');
        return;
      }
      // Store selected type and open tender dialog.
      // TenderDialog handles preemptive placeOrder in its own useEffect.
      setSelectedTenderType(method as 'cash' | 'check' | 'voucher');
      setShowTenderDialog(true);
    },
    [toast],
  );

  const handlePaymentComplete = useCallback(
    (_result: RecordTenderResult) => {
      setShowTenderDialog(false);
      setRemainingBalance(null);
      pos.clearOrder();
      registerTabs.clearActiveTab();
    },
    [pos, registerTabs],
  );

  const handlePartialPayment = useCallback((remaining: number, _version: number) => {
    setRemainingBalance(remaining);
  }, []);

  const handleSaveTab = useCallback(
    async (tabNumber: number) => {
      // Switch to the tab if not active, then hold its order
      if (tabNumber !== registerTabs.activeTabNumber) {
        registerTabs.switchTab(tabNumber);
      }
      await pos.holdOrder();
      registerTabs.clearActiveTab();
    },
    [pos, registerTabs],
  );

  const handleHoldOrder = useCallback(async () => {
    await pos.holdOrder();
    registerTabs.clearActiveTab();
  }, [pos, registerTabs]);

  const handleRecallOrder = useCallback(
    async (orderId: string) => {
      await pos.recallOrder(orderId);
      setShowRecallDialog(false);
    },
    [pos],
  );

  const handleVoidOrder = useCallback(async () => {
    if (!voidReason.trim()) {
      toast.error('Please provide a void reason');
      return;
    }
    await pos.voidOrder(voidReason.trim());
    registerTabs.clearActiveTab();
    setVoidReason('');
    setShowVoidConfirm(false);
  }, [pos, registerTabs, voidReason, toast]);

  const handleShiftEnd = useCallback(async () => {
    try {
      await shift.closeShift(0); // V1: simplified close with 0 counting
      setShowShiftEndConfirm(false);
    } catch {
      // Error toasted by hook
    }
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
      pos.attachCustomer(customerId, customerName);
      if (customerName) {
        const parts = customerName.trim().split(/\s+/);
        const shortName =
          parts.length >= 2
            ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}`
            : parts[0] ?? '';
        registerTabs.renameTab(registerTabs.activeTabNumber, shortName);
      }
    },
    [pos, registerTabs],
  );

  // ── Items to display ────────────────────────────────────────────

  const displayItems = useMemo(() => {
    if (catalog.searchQuery.trim()) {
      return catalog.searchResults;
    }
    return catalog.currentItems;
  }, [catalog.searchQuery, catalog.searchResults, catalog.currentItems]);

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
        onDetachCustomer={pos.detachCustomer}
        onSaveTab={handleSaveTab}
        onChangeServer={registerTabs.changeServer}
        onViewProfile={(id) => profileDrawer.open(id, { source: 'pos' })}
        onAddNewCustomer={() => setShowNewCustomerDialog(true)}
      />

      {/* ── Main Content Area ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT PANEL (60%) ─────────────────────────────────────── */}
        <div className="flex w-[60%] flex-col border-r border-gray-200 bg-surface">
          {/* Search bar */}
          <div className="shrink-0 border-b border-gray-100 px-4 py-3">
            <SearchInput
              value={catalog.searchQuery}
              onChange={catalog.setSearchQuery}
              placeholder="Search items by name, SKU, or barcode..."
              debounceMs={200}
            />
          </div>

          {/* View mode toggle: Catalog vs Quick Menu */}
          <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-2">
            <button
              type="button"
              onClick={() => setViewMode('catalog')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'catalog'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              Tools
            </button>
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
              <div className="shrink-0 border-b border-gray-100 px-4 py-2">
                <DepartmentTabs
                  departments={catalog.departments}
                  selectedId={catalog.nav.departmentId}
                  onSelect={catalog.setDepartment}
                  size="normal"
                />
              </div>

              {/* Sub-department tabs (conditional) */}
              {catalog.currentSubDepartments.length > 0 && (
                <div className="shrink-0 border-b border-gray-100 px-4 py-2">
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
                        <p className="mb-3 text-sm text-gray-500">
                          {displayItems.length} result{displayItems.length !== 1 ? 's' : ''}{' '}
                          for &ldquo;{catalog.searchQuery}&rdquo;
                        </p>
                      )}

                      {displayItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                          <p className="text-sm text-gray-400">
                            {catalog.searchQuery.trim()
                              ? 'No items match your search'
                              : 'No items in this category'}
                          </p>
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

        {/* ── RIGHT PANEL (40%) ────────────────────────────────────── */}
        <div className="flex w-[40%] flex-col bg-surface">
          {/* Customer attachment */}
          <div className="shrink-0 border-b border-gray-200 px-4 py-3">
            <CustomerAttachment
              customerId={pos.currentOrder?.customerId ?? null}
              customerName={pos.currentOrder?.customerName ?? null}
              onAttach={handleAttachCustomer}
              onDetach={pos.detachCustomer}
              onViewProfile={(id) => profileDrawer.open(id, { source: 'pos' })}
            />
          </div>

          {/* Cart */}
          <div className="flex-1 overflow-hidden">
            <Cart
              order={pos.currentOrder}
              onRemoveItem={pos.removeItem}
              label={orderNumber ? `Cart #${orderNumber}` : 'Cart'}
            />
          </div>

          {/* Cart totals */}
          <CartTotals order={pos.currentOrder} />

          {/* Action buttons: Discount + Charges + Tax Exempt */}
          <div className="shrink-0 border-t border-gray-200 px-4 py-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDiscountDialog(true)}
                disabled={!hasItems}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <DollarSign className="h-4 w-4" />
                Discount
              </button>
              <button
                type="button"
                onClick={() => setShowServiceChargeDialog(true)}
                disabled={!hasItems}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Receipt className="h-4 w-4" />
                Service Charge
              </button>
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
                    ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ShieldOff className="h-4 w-4" />
                {pos.currentOrder?.taxExempt ? 'Tax Exempt ✓' : 'Tax Exempt'}
              </button>
            </div>
          </div>

          {/* Send + Pay buttons */}
          <div className="relative shrink-0 px-4 py-2">
            <div className="flex gap-2">
              {/* Send button — highlighted when F&B items present */}
              <button
                type="button"
                onClick={handleSendOrder}
                disabled={!hasItems || isOrderPlaced}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed ${
                  hasFnbItems && hasItems && !isOrderPlaced
                    ? 'bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-300'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40'
                }`}
              >
                <Send className="h-4 w-4" />
                {isOrderPlaced ? 'Sent' : 'Send'}
              </button>

              {/* Pay button */}
              <button
                type="button"
                onClick={handlePayClick}
                disabled={!hasItems}
                className="flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                Pay
                {(remainingBalance ?? pos.currentOrder?.total) ? (
                  <span className="ml-1">{formatMoney(remainingBalance ?? pos.currentOrder?.total ?? 0)}</span>
                ) : null}
              </button>
            </div>

            {/* Payment method picker dropdown */}
            {showPaymentPicker && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowPaymentPicker(false)} />
                <div className="absolute bottom-full left-4 right-4 z-40 mb-2 rounded-lg border border-gray-200 bg-surface shadow-xl">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-semibold uppercase text-gray-500">Payment Method</p>
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => handlePaymentMethod('cash')}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-indigo-50"
                    >
                      <Banknote className="h-5 w-5 text-green-600" />
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentMethod('credit_debit')}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-50"
                    >
                      <CreditCard className="h-5 w-5 text-gray-300" />
                      Credit / Debit
                      <Badge variant="default" className="ml-auto text-[10px]">Coming Soon</Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentMethod('voucher')}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-indigo-50"
                    >
                      <Ticket className="h-5 w-5 text-amber-500" />
                      Voucher
                      <span className="ml-auto text-xs text-gray-400">Gift Card / Credit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentMethod('check')}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-indigo-50"
                    >
                      <FileText className="h-5 w-5 text-blue-500" />
                      Check
                    </button>
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePaymentMethod('split')}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-50"
                      >
                        <Split className="h-5 w-5 text-gray-300" />
                        Split Payment
                        <Badge variant="default" className="ml-auto text-[10px]">Coming Soon</Badge>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Hold / Recall / Void row */}
          <div className="shrink-0 border-t border-gray-100 px-4 py-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleHoldOrder}
                disabled={!hasItems}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Pause className="h-4 w-4" />
                Hold
              </button>
              <button
                type="button"
                onClick={() => setShowRecallDialog(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <History className="h-4 w-4" />
                Recall
                {pos.heldOrderCount > 0 && (
                  <Badge variant="indigo" className="ml-1 text-[10px]">
                    {pos.heldOrderCount}
                  </Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowVoidConfirm(true)}
                disabled={!pos.currentOrder}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-2 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Ban className="h-4 w-4" />
                Void
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer Bar ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2">
        <button
          type="button"
          onClick={() => shift.openDrawer()}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Unlock className="h-3.5 w-3.5" />
          Open Drawer
        </button>
        <button
          type="button"
          onClick={() => toast.info('No Sale logged')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <XCircle className="h-3.5 w-3.5" />
          No Sale
        </button>
        <button
          type="button"
          onClick={() => toast.info('Reprint coming in V2')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Printer className="h-3.5 w-3.5" />
          Reprint
        </button>
        <button
          type="button"
          onClick={() => toast.info('Returns coming in V2')}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Return
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Shift indicator + end */}
        {shift.isOpen ? (
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-xs">
              Shift Open
            </Badge>
            <button
              type="button"
              onClick={() => setShowShiftEndConfirm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Shift End
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => shift.openShift(0)}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            Open Shift
          </button>
        )}
      </div>

      {/* ── Dialogs ────────────────────────────────────────────────── */}

      {/* Modifier Dialog (F&B items) */}
      <ModifierDialog
        open={modifierItem !== null}
        onClose={() => setModifierItem(null)}
        item={modifierItem}
        onAdd={handleModifierAdd}
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
              <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {packageItem.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setPackageItem(null)}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4">
                <p className="text-sm text-gray-600">
                  Package price: <span className="font-semibold">{formatMoney(packageItem.price)}</span>
                </p>
                {packageItem.metadata &&
                  (packageItem.metadata as { packageComponents?: Array<{ itemName: string; qty: number }> }).packageComponents && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700">Includes:</p>
                      <ul className="mt-1 space-y-1">
                        {((packageItem.metadata as { packageComponents?: Array<{ itemName: string; qty: number }> }).packageComponents ?? []).map(
                          (comp, idx) => (
                            <li key={idx} className="text-sm text-gray-500">
                              {comp.qty}x {comp.itemName}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setPackageItem(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handlePackageAdd({ catalogItemId: packageItem.id, qty: 1 })
                  }
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                >
                  Add to Cart
                </button>
              </div>
            </div>
          </div>,
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
              <div className="border-b border-gray-200 px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold text-gray-900">Void Order</h3>
                <p className="mt-1 text-sm text-gray-500">
                  This will void order {pos.currentOrder?.orderNumber}. This action cannot be undone.
                </p>
              </div>
              <div className="px-6 py-4">
                <label htmlFor="void-reason" className="block text-sm font-medium text-gray-700">
                  Reason
                </label>
                <input
                  id="void-reason"
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g., Customer changed mind"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    setVoidReason('');
                    setShowVoidConfirm(false);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVoidOrder}
                  disabled={!voidReason.trim()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  Void Order
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Shift End Confirm */}
      <ConfirmDialog
        open={showShiftEndConfirm}
        onClose={() => setShowShiftEndConfirm(false)}
        onConfirm={handleShiftEnd}
        title="End Shift"
        description="Are you sure you want to close the current shift? Make sure all orders are settled before closing."
        confirmLabel="End Shift"
        destructive
      />

      {/* Tender Dialog (Cash / Voucher / Check) — only render when order has a real ID (not placeholder '') */}
      {pos.currentOrder && pos.currentOrder.id && config && (
        <TenderDialog
          open={showTenderDialog}
          onClose={() => setShowTenderDialog(false)}
          order={pos.currentOrder}
          config={config}
          tenderType={selectedTenderType}
          shiftId={shift.currentShift?.id}
          onPaymentComplete={handlePaymentComplete}
          onPartialPayment={handlePartialPayment}
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
    </div>
  );
}

export default memo(RetailPOSPage);
