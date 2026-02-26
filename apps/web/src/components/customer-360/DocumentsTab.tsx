'use client';

import { useState } from 'react';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Tag,
  Calendar,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  Loader2,
  X,
  File,
  Image,
  FileSpreadsheet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  useCustomerFiles,
  useFileMutations,
} from '@/hooks/use-customer-360';
import type { CustomerFileEntry } from '@/types/customer-360';

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoString));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function docTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function docTypeVariant(type: string): string {
  switch (type) {
    case 'contract':
    case 'membership_agreement':
      return 'info';
    case 'waiver':
    case 'medical_waiver':
      return 'warning';
    case 'id_verification':
      return 'success';
    case 'tax_form':
      return 'neutral';
    case 'photo':
    case 'photo_gallery':
      return 'indigo';
    default:
      return 'neutral';
  }
}

function fileIcon(mimeType: string): typeof File {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return FileSpreadsheet;
  return File;
}

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'waiver', label: 'Waiver' },
  { value: 'id_verification', label: 'ID Verification' },
  { value: 'membership_agreement', label: 'Membership Agreement' },
  { value: 'tax_form', label: 'Tax Form' },
  { value: 'medical_waiver', label: 'Medical Waiver' },
  { value: 'photo', label: 'Photo' },
  { value: 'photo_gallery', label: 'Photo Gallery' },
  { value: 'statement', label: 'Statement' },
  { value: 'other', label: 'Other' },
];

// ── File Card ───────────────────────────────────────────────────

function FileCard({
  file,
  customerId,
  onDeleted,
}: {
  file: CustomerFileEntry;
  customerId: string;
  onDeleted: () => void;
}) {
  const { deleteFile, isLoading } = useFileMutations();
  const FileIcon = fileIcon(file.mimeType);

  const handleDelete = async () => {
    try {
      await deleteFile(customerId, file.id);
      onDeleted();
    } catch {
      // Error handled in hook
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-input">
      <div className="flex items-start gap-3">
        {/* File icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileIcon className="h-5 w-5 text-muted-foreground" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              {file.description && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{file.description}</p>
              )}
            </div>
            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              <a
                href={`/storage/${file.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isLoading}
                className="rounded p-1.5 text-muted-foreground hover:bg-red-500/100/10 hover:text-red-500 disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Metadata row */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={docTypeVariant(file.documentType)}>
              {docTypeLabel(file.documentType)}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              {formatFileSize(file.sizeBytes)}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDate(file.uploadedAt)}
            </span>
            {file.version > 1 && (
              <span className="text-xs text-muted-foreground">v{file.version}</span>
            )}
          </div>

          {/* Tags */}
          {file.tagsJson && file.tagsJson.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Tag className="h-3 w-3 text-muted-foreground" />
              {file.tagsJson.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Expiration warning */}
          {file.expiresAt && (
            <p className="mt-1 text-xs text-amber-500">
              Expires: {formatDate(file.expiresAt)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Upload Form ─────────────────────────────────────────────────

function UploadForm({
  customerId,
  onUploaded,
}: {
  customerId: string;
  onUploaded: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [documentType, setDocumentType] = useState('other');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const { uploadFile, isLoading } = useFileMutations();

  const handleUpload = async () => {
    if (!name.trim()) return;
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      await uploadFile(customerId, {
        documentType,
        name: name.trim(),
        description: description.trim() || undefined,
        storageKey: `uploads/${customerId}/${Date.now()}-${name.trim().replace(/\s+/g, '-')}`,
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        tagsJson: tags.length > 0 ? tags : undefined,
        expiresAt: expiresAt || undefined,
      });
      setName('');
      setDescription('');
      setTagsInput('');
      setExpiresAt('');
      setIsOpen(false);
      onUploaded();
    } catch {
      // Error handled in hook
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-surface px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-indigo-500/30 hover:text-indigo-600"
      >
        <Upload className="h-4 w-4" />
        Upload Document
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-500/30 bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Upload Document</h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded p-1 text-muted-foreground hover:text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Document name..."
              className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2..."
              className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Expires (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-md border border-input bg-surface px-3 py-1.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!name.trim() || isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export default function DocumentsTab({ customerId }: { customerId: string }) {
  const { data, isLoading, error, mutate } = useCustomerFiles(customerId);

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Documents
        </h3>
        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {/* Upload form */}
      <UploadForm customerId={customerId} onUploaded={mutate} />

      {/* Files grid */}
      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-12 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-sm text-muted-foreground">Failed to load documents.</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(data?.items ?? []).map((file) => (
            <FileCard
              key={file.id}
              file={file}
              customerId={customerId}
              onDeleted={mutate}
            />
          ))}
          {(data?.items ?? []).length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No documents uploaded yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
