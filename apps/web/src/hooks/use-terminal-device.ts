'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface DeviceStatus {
  reachable: boolean;
  status: string;
  hsn: string;
  deviceModel: string | null;
}

interface ConnectResult {
  connected: boolean;
  hsn: string;
  deviceModel: string | null;
  deviceLabel: string | null;
}

/**
 * Hook for managing a terminal's payment device connection.
 *
 * Returns device status (connected/disconnected), connect/disconnect/ping
 * mutations, and whether the terminal has a device assigned.
 *
 * Polls connectivity every 60s when a device is assigned.
 */
export function useTerminalDevice(terminalId: string | null) {
  const locationHeaders = typeof window !== 'undefined'
    ? JSON.parse(sessionStorage.getItem('oppsera:location-headers') ?? '{}')
    : {};

  // Check if device is reachable by pinging it
  const pingQuery = useQuery({
    queryKey: ['terminal-device-ping', terminalId],
    queryFn: async () => {
      const res = await apiFetch<{ data: DeviceStatus }>(
        '/api/v1/payments/terminal/ping',
        {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({ terminalId }),
        },
      );
      return res.data;
    },
    enabled: !!terminalId,
    refetchInterval: 60_000, // poll every 60s
    retry: false,
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ data: ConnectResult }>(
        '/api/v1/payments/terminal/connect',
        {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({ terminalId }),
        },
      );
      return res.data;
    },
    onSuccess: () => {
      pingQuery.refetch();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ data: { disconnected: boolean } }>(
        '/api/v1/payments/terminal/disconnect',
        {
          method: 'POST',
          headers: locationHeaders,
          body: JSON.stringify({ terminalId }),
        },
      );
      return res.data;
    },
    onSuccess: () => {
      pingQuery.refetch();
    },
  });

  const hasDevice = !!pingQuery.data?.hsn;
  const isConnected = pingQuery.data?.reachable ?? false;

  return {
    device: pingQuery.data ?? null,
    hasDevice,
    isConnected,
    isLoading: pingQuery.isLoading,
    error: pingQuery.error,
    connect: connectMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    ping: () => pingQuery.refetch(),
    isConnecting: connectMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
  };
}
