'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { Paperclip, Upload, Trash2, FileText, Image, FileSpreadsheet, File } from 'lucide-react';

interface DocumentAttachment {
  id: string;
  journalEntryId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  storageKey: string;
  description: string | null;
  uploadedBy: string;
  createdAt: string;
}

interface DocumentAttachmentsProps {
  journalEntryId: string;
  canManage?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string) {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileType)) return Image;
  if (['xlsx', 'xls', 'csv'].includes(fileType)) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx'].includes(fileType)) return FileText;
  return File;
}

function getFileTypeBadgeColor(fileType: string): string {
  if (['pdf'].includes(fileType)) return 'bg-red-500/10 text-red-500';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(fileType)) return 'bg-blue-500/10 text-blue-500';
  if (['xlsx', 'xls', 'csv'].includes(fileType)) return 'bg-green-500/10 text-green-500';
  if (['doc', 'docx'].includes(fileType)) return 'bg-indigo-500/10 text-indigo-500';
  return 'bg-gray-500/10 text-muted-foreground';
}

export default function DocumentAttachments({ journalEntryId, canManage = false }: DocumentAttachmentsProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['journal-documents', journalEntryId],
    queryFn: async () => {
      const res = await apiFetch<{ data: DocumentAttachment[] }>(
        `/api/v1/accounting/journals/${journalEntryId}/documents`,
      );
      return res.data ?? [];
    },
    staleTime: 30_000,
  });

  const attachMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      const fileType = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';
      return apiFetch(`/api/v1/accounting/journals/${journalEntryId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileType,
          fileSizeBytes: file.size,
          storageKey: `local/${Date.now()}-${file.name}`,
          description: description || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-documents', journalEntryId] });
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      return apiFetch(
        `/api/v1/accounting/journals/${journalEntryId}/documents/${docId}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-documents', journalEntryId] });
      setDeleteConfirmId(null);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be under 10 MB');
      return;
    }

    attachMutation.mutate(file);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          <span>Attachments</span>
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          <span>Attachments</span>
          {documents.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {documents.length}
            </span>
          )}
        </div>
      </div>

      {/* Document list */}
      {documents.length > 0 && (
        <div className="space-y-1.5">
          {documents.map((doc) => {
            const Icon = getFileIcon(doc.fileType);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {doc.fileName}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${getFileTypeBadgeColor(doc.fileType)}`}
                    >
                      {doc.fileType}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    <span>·</span>
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    {doc.description && (
                      <>
                        <span>·</span>
                        <span className="truncate">{doc.description}</span>
                      </>
                    )}
                  </div>
                </div>
                {canManage && (
                  <>
                    {deleteConfirmId === doc.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMutation.mutate(doc.id)}
                          disabled={deleteMutation.isPending}
                          className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(doc.id)}
                        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                        aria-label={`Delete ${doc.fileName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && !canManage && (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <Paperclip className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-1 text-sm text-muted-foreground">No attachments</p>
        </div>
      )}

      {/* Upload area */}
      {canManage && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachMutation.isPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {attachMutation.isPending ? 'Uploading...' : 'Attach File'}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            PDF, images, spreadsheets, or documents up to 10 MB
          </p>
        </div>
      )}
    </div>
  );
}
