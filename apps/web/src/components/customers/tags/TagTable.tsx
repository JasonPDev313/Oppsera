'use client';

import { Pencil, Archive, ArchiveRestore, Eye } from 'lucide-react';
import { ActionMenu } from '@/components/ui/action-menu';
import type { ActionMenuItem } from '@/components/ui/action-menu';
import type { TagListItem } from '@/hooks/use-tags';

interface TagTableProps {
  tags: TagListItem[];
  isLoading: boolean;
  onEdit: (tag: TagListItem) => void;
  onArchive: (tag: TagListItem) => void;
  onUnarchive: (tag: TagListItem) => void;
  onViewRule: (tag: TagListItem) => void;
}

export function TagTable({ tags, isLoading, onEdit, onArchive, onUnarchive, onViewRule }: TagTableProps) {
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-16">
        <p className="text-sm text-gray-500">No tags found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/50">
            <th className="px-4 py-3 font-medium text-gray-600">Name</th>
            <th className="px-4 py-3 font-medium text-gray-600">Type</th>
            <th className="px-4 py-3 font-medium text-gray-600">Category</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">Customers</th>
            <th className="px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 font-medium text-gray-600">Created</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onEdit={onEdit}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onViewRule={onViewRule}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TagRow({
  tag,
  onEdit,
  onArchive,
  onUnarchive,
  onViewRule,
}: {
  tag: TagListItem;
  onEdit: (tag: TagListItem) => void;
  onArchive: (tag: TagListItem) => void;
  onUnarchive: (tag: TagListItem) => void;
  onViewRule: (tag: TagListItem) => void;
}) {
  const isArchived = !!tag.archivedAt;

  const actions: ActionMenuItem[] = [
    {
      key: 'edit',
      label: 'Edit',
      icon: Pencil,
      onClick: () => onEdit(tag),
    },
    ...(isArchived
      ? [
          {
            key: 'unarchive',
            label: 'Unarchive',
            icon: ArchiveRestore,
            onClick: () => onUnarchive(tag),
            dividerBefore: true,
          },
        ]
      : [
          {
            key: 'archive',
            label: 'Archive',
            icon: Archive,
            onClick: () => onArchive(tag),
            destructive: true,
            dividerBefore: true,
          },
        ]),
    {
      key: 'view-rule',
      label: 'View Rule',
      icon: Eye,
      onClick: () => onViewRule(tag),
      hidden: tag.tagType !== 'smart',
    },
  ];

  return (
    <tr className="transition-colors hover:bg-gray-50/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          <span className="font-medium text-gray-900">{tag.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <TypeBadge type={tag.tagType} />
      </td>
      <td className="px-4 py-3 text-gray-600 capitalize">
        {tag.category ?? '\u2014'}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
        {tag.customerCount.toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <StatusBadge isArchived={isArchived} />
      </td>
      <td className="px-4 py-3 text-gray-500">
        {new Date(tag.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <ActionMenu items={actions} />
      </td>
    </tr>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (type === 'smart') {
    return (
      <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
        Smart
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      Manual
    </span>
  );
}

function StatusBadge({ isArchived }: { isArchived: boolean }) {
  if (isArchived) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        Archived
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
      Active
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/50">
            <th className="px-4 py-3 font-medium text-gray-600">Name</th>
            <th className="px-4 py-3 font-medium text-gray-600">Type</th>
            <th className="px-4 py-3 font-medium text-gray-600">Category</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">Customers</th>
            <th className="px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 font-medium text-gray-600">Created</th>
            <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-gray-200" />
                  <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-4 w-10 animate-pulse rounded bg-gray-200" />
              </td>
              <td className="px-4 py-3">
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="ml-auto h-6 w-6 animate-pulse rounded bg-gray-200" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
