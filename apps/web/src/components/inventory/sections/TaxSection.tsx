'use client';

import { useState, useCallback } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useAuthContext } from '@/components/auth-provider';
import { useTaxGroups, useItemTaxGroups } from '@/hooks/use-catalog';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';

interface TaxSectionProps {
  itemId: string;
}

export function TaxSection({ itemId }: TaxSectionProps) {
  const { locations } = useAuthContext();
  const locationId = locations[0]?.id;
  const { toast } = useToast();

  const { data: availableTaxGroups } = useTaxGroups(locationId);
  const { data: assignedTaxGroups, mutate: refetchAssigned } = useItemTaxGroups(itemId, locationId);

  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [saving, setSaving] = useState(false);

  const assignedIds = new Set((assignedTaxGroups ?? []).map((g) => g.taxGroupId));

  // Groups not yet assigned to this item
  const unassignedGroups = (availableTaxGroups ?? []).filter((g) => !assignedIds.has(g.id) && g.isActive);

  const handleAssign = useCallback(async () => {
    if (!selectedGroupId || !locationId) return;
    setSaving(true);
    try {
      const newIds = [...(assignedTaxGroups ?? []).map((g) => g.taxGroupId), selectedGroupId];
      await apiFetch(`/api/v1/catalog/items/${itemId}/tax-groups?locationId=${locationId}`, {
        method: 'PUT',
        body: JSON.stringify({ taxGroupIds: newIds }),
      });
      await refetchAssigned();
      setSelectedGroupId('');
      toast.success('Tax group assigned');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to assign tax group';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [selectedGroupId, locationId, assignedTaxGroups, itemId, refetchAssigned, toast]);

  const handleRemove = useCallback(async (groupId: string) => {
    if (!locationId) return;
    setSaving(true);
    try {
      const newIds = (assignedTaxGroups ?? []).map((g) => g.taxGroupId).filter((id) => id !== groupId);
      await apiFetch(`/api/v1/catalog/items/${itemId}/tax-groups?locationId=${locationId}`, {
        method: 'PUT',
        body: JSON.stringify({ taxGroupIds: newIds }),
      });
      await refetchAssigned();
      toast.success('Tax group removed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove tax group';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [locationId, assignedTaxGroups, itemId, refetchAssigned, toast]);

  return (
    <CollapsibleSection id="tax" title="Tax Groups" defaultOpen={false}>
      <div className="space-y-3">
        {/* Currently assigned tax groups */}
        {assignedTaxGroups && assignedTaxGroups.length > 0 ? (
          <div className="space-y-1.5">
            {assignedTaxGroups.map((group) => (
              <div
                key={group.taxGroupId}
                className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{group.taxGroupName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(group.taxGroupId)}
                  disabled={saving}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-red-500 disabled:opacity-50"
                  title="Remove tax group"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No tax groups assigned to this item.</p>
        )}

        {/* Add tax group */}
        {unassignedGroups.length > 0 && (
          <div className="flex gap-1.5">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select tax group...</option>
              {unassignedGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} — {(group.totalRate * 100).toFixed(2)}%
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAssign}
              disabled={!selectedGroupId || saving}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add
            </button>
          </div>
        )}

        {/* Tax rates breakdown */}
        {assignedTaxGroups && assignedTaxGroups.length > 0 && availableTaxGroups && (
          <div className="rounded-lg border border-border bg-muted p-2.5">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Rate Breakdown</p>
            {assignedTaxGroups.map((assigned) => {
              const full = availableTaxGroups.find((g) => g.id === assigned.taxGroupId);
              if (!full?.rates?.length) return null;
              return (
                <div key={assigned.taxGroupId} className="mt-1">
                  <p className="text-xs font-medium text-foreground">{assigned.taxGroupName}</p>
                  {full.rates.map((rate) => (
                    <div key={rate.id} className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{rate.name}</span>
                      <span>{(Number(rate.rateDecimal) * 100).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
