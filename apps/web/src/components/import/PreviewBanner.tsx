'use client';

import { Shield, CheckCircle, AlertTriangle, Eye } from 'lucide-react';

interface PreviewBannerProps {
  readyCount: number;
  attentionCount: number;
  entityLabel: string;
  isPreview?: boolean;
  /** When true, shows the finalized state instead of preview */
  isFinalized?: boolean;
  /** Additional context message shown below the banner */
  contextMessage?: string;
}

export function PreviewBanner({
  readyCount,
  attentionCount,
  entityLabel,
  isPreview = true,
  isFinalized = false,
  contextMessage,
}: PreviewBannerProps) {
  return (
    <div className="space-y-2">
      {/* Preview / Finalized banner */}
      {isPreview && !isFinalized && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5">
          <Eye className="h-4 w-4 shrink-0 text-blue-500" />
          <div>
            <p className="text-sm font-medium text-blue-500">
              Preview Mode
            </p>
            <p className="text-xs text-blue-500/80">
              This is a preview. No data has been imported yet. Review the mappings below and click &ldquo;Confirm &amp; Import&rdquo; when ready.
            </p>
          </div>
        </div>
      )}
      {isFinalized && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5">
          <Shield className="h-4 w-4 shrink-0 text-green-500" />
          <div>
            <p className="text-sm font-medium text-green-500">
              Import Complete
            </p>
            <p className="text-xs text-green-500/80">
              Your data has been imported successfully. You can view the imported records below.
            </p>
          </div>
        </div>
      )}

      {/* Ready / Attention counts */}
      <div className="flex flex-wrap gap-2">
        {readyCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-sm font-medium text-green-500">
            <CheckCircle className="h-4 w-4" />
            {readyCount.toLocaleString()} {entityLabel} ready to import
          </div>
        )}
        {attentionCount > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-sm font-medium text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            {attentionCount.toLocaleString()} need your attention
          </div>
        )}
        {readyCount === 0 && attentionCount === 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
            No data to preview
          </div>
        )}
      </div>

      {/* Context message */}
      {contextMessage && (
        <p className="text-xs italic text-muted-foreground">{contextMessage}</p>
      )}
    </div>
  );
}
