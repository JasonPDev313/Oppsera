'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Download,
  Upload,
  Calendar,
  AlertCircle,
  File,
  Image,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import type { CustomerDocument } from '@/types/customers';

interface ProfileDocumentsTabProps {
  customerId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getFileIcon(mimeType: string): React.ElementType {
  if (mimeType.startsWith('image/')) return Image;
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('csv')
  )
    return FileSpreadsheet;
  if (mimeType.includes('pdf')) return FileText;
  return File;
}

export function ProfileDocumentsTab({ customerId }: ProfileDocumentsTabProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiFetch<{ data: CustomerDocument[] }>(
        `/api/v1/customers/${customerId}/documents`,
      );
      setDocuments(res.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load documents'));
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownload = async (doc: CustomerDocument) => {
    try {
      const res = await apiFetch<{ data: { url: string } }>(
        `/api/v1/customers/${customerId}/documents/${doc.id}/download`,
      );
      window.open(res.data.url, '_blank');
    } catch {
      toast.error('Failed to download document');
    }
  };

  const handleUpload = () => {
    toast.info('Upload functionality coming soon');
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner label="Loading documents..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-600">Failed to load documents.</p>
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

  return (
    <div className="p-6">
      {/* Upload button */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleUpload}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload File
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents"
          description="No files have been uploaded for this customer."
          action={{ label: 'Upload File', onClick: handleUpload }}
        />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const FileIcon = getFileIcon(doc.mimeType);
            const isExpired =
              doc.expiresAt && new Date(doc.expiresAt) < new Date();

            return (
              <div
                key={doc.id}
                className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
                  isExpired
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileIcon
                    className={`h-5 w-5 shrink-0 ${
                      isExpired ? 'text-red-400' : 'text-gray-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {doc.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{doc.documentType}</span>
                      <span>&middot;</span>
                      <span>{formatFileSize(doc.sizeBytes)}</span>
                      <span>&middot;</span>
                      <span>{formatDate(doc.uploadedAt)}</span>
                    </div>
                    {doc.description && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">
                        {doc.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {isExpired && (
                    <Badge variant="error">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Expired
                    </Badge>
                  )}
                  {doc.expiresAt && !isExpired && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      Exp: {formatDate(doc.expiresAt)}
                    </span>
                  )}
                  <Badge variant="neutral">
                    {doc.mimeType.split('/')[1] || doc.mimeType}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
