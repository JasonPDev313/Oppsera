'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Order } from '@/types/pos';

const CHANNEL_NAME = 'oppsera-customer-display';

export interface CustomerDisplayMessage {
  type: 'order-update' | 'clear' | 'payment-complete';
  order: Order | null;
  businessName?: string;
}

/**
 * Hook for the POS side — broadcasts order state to customer display windows.
 */
export function useCustomerDisplayBroadcast() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const windowRef = useRef<Window | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    }
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const broadcast = useCallback((msg: CustomerDisplayMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const broadcastOrder = useCallback((order: Order | null) => {
    broadcast({ type: order ? 'order-update' : 'clear', order });
  }, [broadcast]);

  const broadcastPaymentComplete = useCallback(() => {
    broadcast({ type: 'payment-complete', order: null });
  }, [broadcast]);

  const openDisplay = useCallback(() => {
    // If window is still open, focus it
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.focus();
      return;
    }
    windowRef.current = window.open(
      '/pos/customer-display',
      'oppsera-customer-display',
      'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no',
    );
  }, []);

  const closeDisplay = useCallback(() => {
    if (windowRef.current && !windowRef.current.closed) {
      windowRef.current.close();
    }
    windowRef.current = null;
  }, []);

  const isDisplayOpen = useCallback(() => {
    return windowRef.current !== null && !windowRef.current.closed;
  }, []);

  return { broadcastOrder, broadcastPaymentComplete, openDisplay, closeDisplay, isDisplayOpen };
}

/**
 * Hook for the customer display side — subscribes to order updates.
 */
export function useCustomerDisplayReceiver(
  onMessage: (msg: CustomerDisplayMessage) => void,
) {
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      callbackRef.current(event.data);
    };
    return () => channel.close();
  }, []);
}
