'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  StickyNote,
  AlertTriangle,
  Plus,
  Clock,
  User,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerActivity, CustomerIncident } from '@/types/customers';

interface ProfileNotesTabProps {
  customerId: string;
}

interface NotesData {
  staffNotes: CustomerActivity[];
  incidents: CustomerIncident[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

const SEVERITY_VARIANTS: Record<string, string> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info',
};

const INCIDENT_STATUS_VARIANTS: Record<string, string> = {
  open: 'warning',
  investigating: 'info',
  resolved: 'success',
  closed: 'neutral',
};

export function ProfileNotesTab({ customerId }: ProfileNotesTabProps) {
  const { toast } = useToast();
  const [data, setData] = useState<NotesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeSection, setActiveSection] = useState<'notes' | 'incidents'>('notes');
  const [newNote, setNewNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: NotesData }>(
        `/api/v1/customers/${customerId}/notes`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load notes'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      setIsSubmitting(true);
      await apiFetch(`/api/v1/customers/${customerId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: newNote.trim() }),
      });
      toast.success('Note added');
      setNewNote('');
      fetchData();
    } catch {
      toast.error('Failed to add note');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading notes..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Failed to load notes.</p>
        <button
          type="button"
          onClick={fetchData}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          Try again
        </button>
      </div>
    );
  }

  const { staffNotes, incidents } = data;

  return (
    <div className="p-6">
      {/* Section toggle */}
      <div className="mb-4 flex rounded-lg border border-border bg-muted p-0.5">
        <button
          type="button"
          onClick={() => setActiveSection('notes')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeSection === 'notes'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Notes ({staffNotes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('incidents')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeSection === 'incidents'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Incidents ({incidents.length})
        </button>
      </div>

      {/* Notes Section */}
      {activeSection === 'notes' && (
        <div className="space-y-4">
          {/* Add note form */}
          <div className="rounded-lg border border-border p-3">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              rows={3}
              className="w-full resize-none rounded-md border border-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleAddNote}
                disabled={!newNote.trim() || isSubmitting}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {isSubmitting ? 'Adding...' : 'Add Note'}
              </button>
            </div>
          </div>

          {/* Notes list */}
          {staffNotes.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="No notes"
              description="No staff notes have been added for this customer."
            />
          ) : (
            <div className="space-y-2">
              {staffNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium text-foreground">{note.title}</p>
                  {note.details && (
                    <p className="mt-1 text-sm text-muted-foreground">{note.details}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(note.createdAt)}
                    </span>
                    {note.createdBy && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {note.createdBy}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Incidents Section */}
      {activeSection === 'incidents' && (
        <div className="space-y-3">
          {incidents.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No incidents"
              description="No incidents have been reported for this customer."
            />
          ) : (
            incidents.map((incident) => (
              <div
                key={incident.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        incident.severity === 'critical' || incident.severity === 'high'
                          ? 'text-red-500'
                          : incident.severity === 'medium'
                            ? 'text-amber-500'
                            : 'text-blue-500'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {incident.subject}
                      </p>
                      {incident.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {incident.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge variant={SEVERITY_VARIANTS[incident.severity] || 'neutral'}>
                      {incident.severity}
                    </Badge>
                    <Badge
                      variant={
                        INCIDENT_STATUS_VARIANTS[incident.status] || 'neutral'
                      }
                    >
                      {incident.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDate(incident.createdAt)}</span>
                  <span>Type: {incident.incidentType}</span>
                  {incident.reportedBy && <span>By: {incident.reportedBy}</span>}
                  {incident.compensationCents !== null &&
                    incident.compensationCents > 0 && (
                      <span className="font-medium text-green-500">
                        Comp: {formatCurrency(incident.compensationCents)}
                        {incident.compensationType && ` (${incident.compensationType})`}
                      </span>
                    )}
                </div>
                {incident.resolution && (
                  <div className="mt-2 rounded border border-green-100 bg-green-500/10 px-2 py-1">
                    <p className="text-xs text-green-800">
                      <span className="font-medium">Resolution:</span>{' '}
                      {incident.resolution}
                    </p>
                    {incident.resolvedBy && incident.resolvedAt && (
                      <p className="mt-0.5 text-xs text-green-500">
                        Resolved by {incident.resolvedBy} on{' '}
                        {formatDate(incident.resolvedAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
