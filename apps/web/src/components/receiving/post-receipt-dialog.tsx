'use client';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface PostReceiptDialogProps {
  open: boolean;
  lineCount: number;
  total: number;
  onConfirm: () => void;
  onClose: () => void;
  isPosting?: boolean;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function PostReceiptDialog({
  open,
  lineCount,
  total,
  onConfirm,
  onClose,
  isPosting,
}: PostReceiptDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="Post Receipt"
      description={`Post this receipt with ${lineCount} line item${lineCount !== 1 ? 's' : ''} totaling ${formatMoney(total)}? This will update inventory levels and costs. This action cannot be undone (but can be voided).`}
      confirmLabel={isPosting ? 'Posting...' : 'Post Receipt'}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
