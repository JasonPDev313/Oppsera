'use client';

import { ShieldX } from 'lucide-react';
import { usePermissionsContext } from '@/components/permissions-provider';

interface PermissionGateProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const defaultFallback = (
  <div className="flex h-[calc(100vh-64px)] flex-col items-center justify-center gap-3 text-gray-400">
    <ShieldX className="h-12 w-12" />
    <p className="text-lg font-medium">Access Denied</p>
    <p className="text-sm">You do not have permission to view this page.</p>
  </div>
);

export function PermissionGate({ permission, children, fallback }: PermissionGateProps) {
  const { can, isLoading } = usePermissionsContext();

  if (isLoading) return null;
  if (!can(permission)) return <>{fallback ?? defaultFallback}</>;
  return <>{children}</>;
}
