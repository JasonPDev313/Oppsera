'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, Users, Plus, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerSegmentMembership } from '@/types/customers';

interface ProfileTagsTabProps {
  customerId: string;
}

interface TagsData {
  tags: string[];
  segments: CustomerSegmentMembership[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const SEGMENT_TYPE_VARIANTS: Record<string, string> = {
  static: 'neutral',
  dynamic: 'info',
  smart: 'indigo',
  manual: 'neutral',
};

export function ProfileTagsTab({ customerId }: ProfileTagsTabProps) {
  const { toast } = useToast();
  const [data, setData] = useState<TagsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [newTag, setNewTag] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: TagsData }>(
        `/api/v1/customers/${customerId}/tags`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tags'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    try {
      setIsAdding(true);
      await apiFetch(`/api/v1/customers/${customerId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag: newTag.trim() }),
      });
      toast.success('Tag added');
      setNewTag('');
      fetchData();
    } catch {
      toast.error('Failed to add tag');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    try {
      await apiFetch(`/api/v1/customers/${customerId}/tags`, {
        method: 'DELETE',
        body: JSON.stringify({ tag }),
      });
      toast.success('Tag removed');
      fetchData();
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading tags..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Failed to load tags.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const { tags, segments } = data;

  return (
    <div className="space-y-6 p-6">
      {/* Tags */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Tags
        </h3>

        {/* Add tag input */}
        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag();
            }}
            placeholder="Add a tag..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddTag}
            disabled={!newTag.trim() || isAdding}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {isAdding ? 'Adding...' : 'Add'}
          </button>
        </div>

        {tags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No tags"
            description="No tags have been applied to this customer."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-inset ring-indigo-600/20"
              >
                <Tag className="h-3 w-3" />
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-0.5 rounded-full p-0.5 text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Segments */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Segments
        </h3>
        {segments.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No segments"
            description="This customer is not a member of any segments."
          />
        ) : (
          <div className="space-y-2">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {segment.segmentName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Added {formatDate(segment.addedAt)}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={SEGMENT_TYPE_VARIANTS[segment.segmentType] || 'neutral'}
                >
                  {segment.segmentType}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
