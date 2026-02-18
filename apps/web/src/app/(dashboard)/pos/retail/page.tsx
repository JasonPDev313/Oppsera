'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Loader2,
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
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useToast } from '@/components/ui/toast';
import { usePOSConfig } from '@/hooks/use-pos-config';
import { usePOS } from '@/hooks/use-pos';
import { useRegisterTabs } from '@/hooks/use-register-tabs';
import { useCatalogForPOS } from '@/hooks/use-catalog-for-pos';
import { useShift } from '@/hooks/use-shift';
import { SearchInput } from '@/components/ui/search-input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { ItemButton } from '@/components/pos/ItemButton';
import { Cart } from '@/components/pos/Cart';
import { CartTotals } from '@/components/pos/CartTotals';
import { CustomerAttachment } from '@/components/pos/CustomerAttachment';
import {
  DepartmentTabs,
  SubDepartmentTabs,
  CategoryRail,
  CatalogBreadcrumb,
  QuickMenuTab,
} from '@/components/pos/catalog-nav';
import { ModifierDialog } from '@/components/pos/ModifierDialog';
import { OptionPickerDialog } from '@/components/pos/OptionPickerDialog';
import { TenderDialog } from '@/components/pos/TenderDialog';
import { TaxExemptDialog } from '@/components/pos/TaxExemptDialog';
import { NewCustomerDialog } from '@/components/pos/NewCustomerDialog';
import { RegisterTabs } from '@/components/pos/RegisterTabs';
import { ToolsView } from '@/components/pos/ToolsView';
import { useProfileDrawer } from '@/components/customer-profile-drawer';
import type { CatalogItemForPOS, AddLineItemInput, HeldOrder, RecordTenderResult } from '@/types/pos';
import type { RetailMetadata } from '@oppsera/shared';

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

export default function RetailPOSPage() {
  const { locations, user } = useAuthContext();
  const { isModuleEnabled } = useEntitlements();
  const router = useRouter();
  const { toast } = useToast();
  const canEditItem = isModuleEnabled('catalog');

  // Location
  const locationId = locations[0]?.id ?? '';

  // Hooks
  const { config, isLoading: configLoading } = usePOSConfig(locationId, 'retail');
  const pos = usePOS(config ?? {
    posMode: 'retail',
    terminalId: '',
    locationId,
    tipEnabled: false,
    receiptMode: 'ask' as const,
    barcodeEnabled: true,
    kitchenSendEnabled: false,
  });
  const registerTabs = useRegisterTabs({
    terminalId: config?.terminalId ?? '',
    pos,
    employeeId: user?.id ?? '',
    employeeName: user?.name ?? '',
  });
  const catalog = useCatalogForPOS(locationId);
  const shift = useShift(locationId, config?.terminalId ?? '');
  const profileDrawer = useProfileDrawer();

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
      router.push(`/catalog/items/${itemId}`);
    },
    [router],
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
        case 'fnb':
          setModifierItem(item);
          break;
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
  }, [catalog, toast, handleItemTap]);

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
  }, []);

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
      // Store selected type and open tender dialog
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
        onAttachCustomer={pos.attachCustomer}
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
                <div className="flex-1 overflow-y-auto p-4">
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
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))' }}>
                          {displayItems.map((item) => (
                            <ItemButton
                              key={item.id}
                              item={item}
                              onTap={handleItemTap}
                              size="normal"
                              isFavorite={catalog.isFavorite(item.id)}
                              onToggleFavorite={catalog.toggleFavorite}
                              canEditItem={canEditItem}
                              onEditItem={handleEditItem}
                            />
                          ))}
                        </div>
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
              onAttach={pos.attachCustomer}
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
                disabled={!hasItems || isOrderPlaced || pos.isLoading}
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
                disabled={!hasItems || pos.isLoading}
                className="flex flex-[1.5] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {pos.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : null}
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

      {/* Discount Dialog — V1: uses confirm dialog with toast */}
      {showDiscountDialog && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowDiscountDialog(false)} />
            <div className="relative w-full max-w-sm rounded-lg bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold text-gray-900">Apply Discount</h3>
                <button
                  type="button"
                  onClick={() => setShowDiscountDialog(false)}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-gray-500">
                  Subtotal: {formatMoney(pos.currentOrder?.subtotal ?? 0)}
                </p>
                <div className="flex gap-2">
                  <DiscountQuickButton
                    label="5%"
                    onClick={() => {
                      pos.applyDiscount('percentage', 5, '5% discount');
                      setShowDiscountDialog(false);
                    }}
                  />
                  <DiscountQuickButton
                    label="10%"
                    onClick={() => {
                      pos.applyDiscount('percentage', 10, '10% discount');
                      setShowDiscountDialog(false);
                    }}
                  />
                  <DiscountQuickButton
                    label="15%"
                    onClick={() => {
                      pos.applyDiscount('percentage', 15, '15% discount');
                      setShowDiscountDialog(false);
                    }}
                  />
                  <DiscountQuickButton
                    label="20%"
                    onClick={() => {
                      pos.applyDiscount('percentage', 20, '20% discount');
                      setShowDiscountDialog(false);
                    }}
                  />
                </div>
                <CustomDiscountInput
                  onApply={(type, value, reason) => {
                    pos.applyDiscount(type, value, reason);
                    setShowDiscountDialog(false);
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Service Charge Dialog — V1 simplified inline */}
      {showServiceChargeDialog && typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowServiceChargeDialog(false)} />
            <div className="relative w-full max-w-sm rounded-lg bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold text-gray-900">Add Service Charge</h3>
                <button
                  type="button"
                  onClick={() => setShowServiceChargeDialog(false)}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-6 py-4 space-y-3">
                <p className="text-sm text-gray-500">
                  Subtotal: {formatMoney(pos.currentOrder?.subtotal ?? 0)}
                </p>
                <div className="flex gap-2">
                  <ChargeQuickButton
                    label="10% Service"
                    onClick={() => {
                      pos.addServiceCharge({
                        chargeType: 'service_charge',
                        name: 'Service Charge',
                        calculationType: 'percentage',
                        value: 10,
                        isTaxable: false,
                      });
                      setShowServiceChargeDialog(false);
                    }}
                  />
                  <ChargeQuickButton
                    label="15% Service"
                    onClick={() => {
                      pos.addServiceCharge({
                        chargeType: 'service_charge',
                        name: 'Service Charge',
                        calculationType: 'percentage',
                        value: 15,
                        isTaxable: false,
                      });
                      setShowServiceChargeDialog(false);
                    }}
                  />
                </div>
                <CustomChargeInput
                  onAdd={(charge) => {
                    pos.addServiceCharge(charge);
                    setShowServiceChargeDialog(false);
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}

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
          onPlaceOrder={pos.placeOrder}
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
          pos.attachCustomer(customerId);
          // Auto-rename the active tab to the customer's name
          const parts = displayName.trim().split(/\s+/);
          const shortName =
            parts.length >= 2
              ? `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}`
              : parts[0] ?? '';
          registerTabs.renameTab(registerTabs.activeTabNumber, shortName);
          toast.success(`Customer "${displayName}" created and attached`);
        }}
      />
    </div>
  );
}

// ── Discount Quick Button ─────────────────────────────────────────

function DiscountQuickButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
    >
      {label}
    </button>
  );
}

// ── Custom Discount Input ─────────────────────────────────────────

function CustomDiscountInput({
  onApply,
}: {
  onApply: (type: string, value: number, reason: string) => void;
}) {
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const handleApply = () => {
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) return;
    const finalValue = discountType === 'fixed' ? Math.round(val * 100) : val;
    onApply(discountType, finalValue, discountReason || `${discountValue}${discountType === 'percentage' ? '%' : ''} discount`);
  };

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-500 uppercase">Custom Discount</p>
      <div className="flex gap-2">
        <select
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="percentage">%</option>
          <option value="fixed">$</option>
        </select>
        <input
          type="number"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          placeholder={discountType === 'percentage' ? 'e.g., 10' : 'e.g., 5.00'}
          min="0"
          step={discountType === 'percentage' ? '1' : '0.01'}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <input
        type="text"
        value={discountReason}
        onChange={(e) => setDiscountReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={!discountValue || parseFloat(discountValue) <= 0}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        Apply Discount
      </button>
    </div>
  );
}

// ── Charge Quick Button ───────────────────────────────────────────

function ChargeQuickButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
    >
      {label}
    </button>
  );
}

// ── Custom Charge Input ───────────────────────────────────────────

function CustomChargeInput({
  onAdd,
}: {
  onAdd: (charge: {
    chargeType: string;
    name: string;
    calculationType: string;
    value: number;
    isTaxable: boolean;
  }) => void;
}) {
  const [chargeCalc, setChargeCalc] = useState<'percentage' | 'fixed'>('percentage');
  const [chargeValue, setChargeValue] = useState('');
  const [chargeName, setChargeName] = useState('');

  const handleAdd = () => {
    const val = parseFloat(chargeValue);
    if (isNaN(val) || val <= 0) return;
    const finalValue = chargeCalc === 'fixed' ? Math.round(val * 100) : val;
    onAdd({
      chargeType: 'service_charge',
      name: chargeName || 'Service Charge',
      calculationType: chargeCalc,
      value: finalValue,
      isTaxable: false,
    });
  };

  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-500 uppercase">Custom Charge</p>
      <input
        type="text"
        value={chargeName}
        onChange={(e) => setChargeName(e.target.value)}
        placeholder="Charge name (optional)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <select
          value={chargeCalc}
          onChange={(e) => setChargeCalc(e.target.value as 'percentage' | 'fixed')}
          className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="percentage">%</option>
          <option value="fixed">$</option>
        </select>
        <input
          type="number"
          value={chargeValue}
          onChange={(e) => setChargeValue(e.target.value)}
          placeholder={chargeCalc === 'percentage' ? 'e.g., 10' : 'e.g., 5.00'}
          min="0"
          step={chargeCalc === 'percentage' ? '1' : '0.01'}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!chargeValue || parseFloat(chargeValue) <= 0}
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
      >
        Add Charge
      </button>
    </div>
  );
}
