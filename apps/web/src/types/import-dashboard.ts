export interface ImportLogEntry {
  id: string;
  importType: string; // registry key (e.g. 'customers', 'staff', 'catalog')
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  totalRows: number;
  successRows: number;
  errorRows: number;
  createdAt: string;
  completedAt?: string;
}
