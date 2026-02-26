'use client';

import { ConfidenceBadge } from '@/components/import/ConfidenceBadge';
import type { ColumnMapping, DetectedTransform } from '@/hooks/use-customer-import';

// Target field groups for the dropdown
const FIELD_GROUPS = [
  { key: 'identity', label: 'Identity', fields: [
    { key: 'firstName', label: 'First Name' }, { key: 'lastName', label: 'Last Name' },
    { key: 'fullName', label: 'Full Name (auto-split)' }, { key: 'organizationName', label: 'Organization' },
    { key: 'prefix', label: 'Prefix' }, { key: 'suffix', label: 'Suffix' },
    { key: 'nickname', label: 'Nickname' }, { key: 'memberNumber', label: 'Member Number' },
    { key: 'type', label: 'Customer Type' },
  ]},
  { key: 'contact', label: 'Contact', fields: [
    { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
    { key: 'homePhone', label: 'Home Phone' }, { key: 'preferredContactMethod', label: 'Preferred Contact' },
  ]},
  { key: 'address', label: 'Address', fields: [
    { key: 'addressLine1', label: 'Address Line 1' }, { key: 'addressLine2', label: 'Address Line 2' },
    { key: 'city', label: 'City' }, { key: 'state', label: 'State' },
    { key: 'postalCode', label: 'Postal Code' }, { key: 'country', label: 'Country' },
    { key: 'combinedCityStateZip', label: 'City, State Zip (auto-split)' },
  ]},
  { key: 'demographics', label: 'Demographics', fields: [
    { key: 'dateOfBirth', label: 'Date of Birth' }, { key: 'gender', label: 'Gender' },
    { key: 'anniversary', label: 'Anniversary' },
  ]},
  { key: 'golf', label: 'Golf', fields: [
    { key: 'handicapIndex', label: 'Handicap Index' }, { key: 'ghinNumber', label: 'GHIN Number' },
  ]},
  { key: 'financial', label: 'Financial', fields: [
    { key: 'houseAccountBalance', label: 'House Account Balance' },
    { key: 'creditLimit', label: 'Credit Limit' }, { key: 'taxExempt', label: 'Tax Exempt' },
  ]},
  { key: 'marketing', label: 'Marketing', fields: [
    { key: 'marketingConsent', label: 'Marketing Opt-In' }, { key: 'acquisitionSource', label: 'Acquisition Source' },
    { key: 'referralSource', label: 'Referral Source' }, { key: 'tags', label: 'Tags' },
  ]},
  { key: 'membership', label: 'Membership', fields: [
    { key: 'membershipType', label: 'Membership Type' }, { key: 'membershipStatus', label: 'Membership Status' },
    { key: 'joinDate', label: 'Join Date' }, { key: 'expirationDate', label: 'Expiration Date' },
  ]},
  { key: 'status', label: 'Status', fields: [
    { key: 'status', label: 'Customer Status' }, { key: 'notes', label: 'Notes' },
  ]},
  { key: 'meta', label: 'Other', fields: [
    { key: 'externalId', label: 'External / Legacy ID' }, { key: 'spouseName', label: 'Spouse Name' },
  ]},
];

interface ColumnMappingTableProps {
  mappings: ColumnMapping[];
  transforms: DetectedTransform[];
  sampleRows: string[][];
  onUpdateMapping: (sourceIndex: number, targetField: string | null) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ColumnMappingTable({
  mappings,
  transforms,
  sampleRows,
  onUpdateMapping,
  onContinue,
  onBack,
}: ColumnMappingTableProps) {
  const mappedCount = mappings.filter((m) => m.targetField !== null).length;
  const skippedCount = mappings.filter((m) => m.targetField === null).length;

  // Get used target fields to prevent duplicate mapping
  const usedTargets = new Set(mappings.map((m) => m.targetField).filter(Boolean) as string[]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Review Column Mappings
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {mappedCount} of {mappings.length} columns mapped ({skippedCount} skipped).
          Adjust any mappings that don&apos;t look right.
        </p>
      </div>

      {/* Transform pills */}
      {transforms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {transforms.map((t) => (
            <span
              key={t.sourceIndex}
              className="inline-flex items-center rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-500"
            >
              &quot;{t.sourceHeader}&quot; → {t.description}
            </span>
          ))}
        </div>
      )}

      {/* Mapping table */}
      <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                CSV Column
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                Sample Data
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                Confidence
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                OppsEra Field
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {mappings.map((mapping) => {
              const samples = sampleRows
                .map((row) => row[mapping.sourceIndex] ?? '')
                .filter(Boolean)
                .slice(0, 3);

              return (
                <tr key={mapping.sourceIndex} className={!mapping.targetField ? 'bg-muted/50' : ''}>
                  <td className="px-4 py-2 text-sm font-medium text-foreground">
                    {mapping.sourceHeader}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-xs text-muted-foreground">
                    {samples.join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <ConfidenceBadge
                      confidence={mapping.confidence}
                      method={mapping.method}
                      reasoning={mapping.reasoning}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="w-full rounded border border-input bg-surface px-2 py-1 text-sm"
                      value={mapping.targetField ?? ''}
                      onChange={(e) => onUpdateMapping(mapping.sourceIndex, e.target.value || null)}
                    >
                      <option value="">— Skip —</option>
                      {FIELD_GROUPS.map((group) => (
                        <optgroup key={group.key} label={group.label}>
                          {group.fields.map((field) => (
                            <option
                              key={field.key}
                              value={field.key}
                              disabled={usedTargets.has(field.key) && mapping.targetField !== field.key}
                            >
                              {field.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="rounded-md border border-input bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          disabled={mappedCount === 0}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Validate & Preview
        </button>
      </div>
    </div>
  );
}
