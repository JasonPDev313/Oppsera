'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { VendorStatusBadge } from '@/components/vendors/vendor-status-badge';
import { VendorSummaryCards } from '@/components/vendors/vendor-summary-cards';
import { VendorInfoPanel } from '@/components/vendors/vendor-info-panel';
import { VendorForm } from '@/components/vendors/vendor-form';
import { VendorCatalogTable } from '@/components/vendors/vendor-catalog-table';
import { VendorCatalogAddDialog } from '@/components/vendors/vendor-catalog-add-dialog';
import { VendorCatalogEditDialog } from '@/components/vendors/vendor-catalog-edit-dialog';
import { useVendor, useVendorCatalog, useVendorMutations } from '@/hooks/use-vendors';
import type { VendorFormInput, VendorCatalogEntry, VendorCatalogItemInput } from '@/types/vendors';

type Tab = 'info' | 'catalog' | 'edit';

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vendorId = params.id as string;
  const { toast } = useToast();

  const { data: vendor, isLoading, error, mutate: refreshVendor } = useVendor(vendorId);
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editEntry, setEditEntry] = useState<VendorCatalogEntry | null>(null);

  const {
    items: catalogItems,
    isLoading: catalogLoading,
    hasMore: catalogHasMore,
    loadMore: catalogLoadMore,
    mutate: refreshCatalog,
  } = useVendorCatalog(vendorId, { search: catalogSearch || undefined });

  const {
    isSubmitting,
    updateVendor,
    deactivateVendor,
    reactivateVendor,
    addCatalogItem,
    updateCatalogItem,
    removeCatalogItem,
  } = useVendorMutations();

  const handleUpdate = useCallback(async (input: VendorFormInput) => {
    try {
      await updateVendor(vendorId, input);
      toast.success('Vendor updated');
      refreshVendor();
      setActiveTab('info');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update vendor');
    }
  }, [vendorId, updateVendor, refreshVendor, toast]);

  const handleToggleActive = useCallback(async () => {
    if (!vendor) return;
    try {
      if (vendor.isActive) {
        await deactivateVendor(vendorId);
        toast.success('Vendor deactivated');
      } else {
        await reactivateVendor(vendorId);
        toast.success('Vendor reactivated');
      }
      refreshVendor();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update vendor status');
    }
  }, [vendor, vendorId, deactivateVendor, reactivateVendor, refreshVendor, toast]);

  const handleAddCatalogItem = useCallback(async (input: VendorCatalogItemInput) => {
    try {
      await addCatalogItem(vendorId, input);
      toast.success('Item added to catalog');
      setShowAddDialog(false);
      refreshCatalog();
      refreshVendor();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add catalog item');
    }
  }, [vendorId, addCatalogItem, refreshCatalog, refreshVendor, toast]);

  const handleUpdateCatalogItem = useCallback(async (itemVendorId: string, input: Partial<VendorCatalogItemInput>) => {
    try {
      await updateCatalogItem(vendorId, itemVendorId, input);
      toast.success('Catalog item updated');
      setEditEntry(null);
      refreshCatalog();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update catalog item');
    }
  }, [vendorId, updateCatalogItem, refreshCatalog, toast]);

  const handleRemoveCatalogItem = useCallback(async (itemVendorId: string) => {
    try {
      await removeCatalogItem(vendorId, itemVendorId);
      toast.success('Item removed from catalog');
      refreshCatalog();
      refreshVendor();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to remove catalog item');
    }
  }, [vendorId, removeCatalogItem, refreshCatalog, refreshVendor, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-600">{error ?? 'Vendor not found'}</p>
        <button
          type="button"
          onClick={() => router.push('/vendors')}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to Vendors
        </button>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'catalog', label: `Catalog (${vendor.activeCatalogItemCount})` },
    { key: 'edit', label: 'Edit' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/vendors')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{vendor.name}</h1>
              <VendorStatusBadge isActive={vendor.isActive} />
            </div>
            {vendor.accountNumber && (
              <p className="mt-0.5 text-sm text-gray-500">Account: {vendor.accountNumber}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={isSubmitting}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              vendor.isActive
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-600 hover:bg-green-50'
            }`}
          >
            {vendor.isActive ? (
              <>
                <PowerOff className="h-4 w-4" />
                Deactivate
              </>
            ) : (
              <>
                <Power className="h-4 w-4" />
                Reactivate
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <VendorSummaryCards vendor={vendor} />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && <VendorInfoPanel vendor={vendor} />}

      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Vendor Catalog</h2>
            <button
              type="button"
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add Item
            </button>
          </div>
          <VendorCatalogTable
            items={catalogItems}
            isLoading={catalogLoading}
            hasMore={catalogHasMore}
            onLoadMore={catalogLoadMore}
            onSearch={setCatalogSearch}
            onEdit={setEditEntry}
            onRemove={handleRemoveCatalogItem}
          />
        </div>
      )}

      {activeTab === 'edit' && (
        <div className="rounded-lg border border-gray-200 bg-surface p-6">
          <VendorForm
            vendor={vendor}
            onSubmit={handleUpdate}
            onCancel={() => setActiveTab('info')}
            isSubmitting={isSubmitting}
          />
        </div>
      )}

      {/* Dialogs */}
      <VendorCatalogAddDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={handleAddCatalogItem}
        isSubmitting={isSubmitting}
      />
      <VendorCatalogEditDialog
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSubmit={handleUpdateCatalogItem}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
