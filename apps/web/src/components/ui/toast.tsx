'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, XCircle, Info } from 'lucide-react';

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastItem['type'], message: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), 5000);
    },
    [removeToast],
  );

  const toast = {
    success: (message: string) => addToast('success', message),
    error: (message: string) => addToast('error', message),
    info: (message: string) => addToast('info', message),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const typeStyles = {
  success: {
    bg: 'bg-green-50 border-green-200',
    text: 'text-green-800',
    Icon: CheckCircle,
    iconClass: 'text-green-500',
  },
  error: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    Icon: XCircle,
    iconClass: 'text-red-500',
  },
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    Icon: Info,
    iconClass: 'text-blue-500',
  },
};

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const style = typeStyles[item.type];
  return (
    <div
      className={`flex w-80 items-start gap-3 rounded-lg border p-4 shadow-lg ${style.bg}`}
    >
      <style.Icon className={`h-5 w-5 shrink-0 ${style.iconClass}`} />
      <p className={`flex-1 text-sm ${style.text}`}>{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-gray-400 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
