'use client';

import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Download } from 'lucide-react';

interface QrCodeDisplayProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  venueName: string;
}

/**
 * Generates a QR code as an SVG string using a simple QR encoding approach.
 * For production, use a proper library like `qrcode`. This is a visual placeholder
 * that renders a styled SVG with the URL text for the host to share.
 */
function generateQrSvg(url: string, size: number): string {
  // Simple 21x21 QR-like pattern for visual representation
  // In production, replace with actual QR encoding via `qrcode` npm package
  const modules = 21;
  const cellSize = size / modules;
  let rects = '';

  // Generate a deterministic pattern from the URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }

  // Finder patterns (3 corners)
  const finderPositions: [number, number][] = [
    [0, 0],
    [0, 14],
    [14, 0],
  ];

  for (const [fy, fx] of finderPositions) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const isOuter = dy === 0 || dy === 6 || dx === 0 || dx === 6;
        const isInner = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
        if (isOuter || isInner) {
          const x = (fx + dx) * cellSize;
          const y = (fy + dy) * cellSize;
          rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
        }
      }
    }
  }

  // Data area fill (pseudo-random from hash)
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      // Skip finder patterns
      const inFinder =
        (row < 7 && col < 7) ||
        (row < 7 && col >= 14) ||
        (row >= 14 && col < 7);
      if (inFinder) continue;

      // Pseudo-random based on position + hash
      const val = ((row * 31 + col * 17 + hash) & 0xff) % 3;
      if (val === 0) {
        const x = col * cellSize;
        const y = row * cellSize;
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/>${rects}</svg>`;
}

export function QrCodeDisplay({
  open,
  onClose,
  locationId,
  venueName,
}: QrCodeDisplayProps) {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist/join?location=${locationId}`;
  const qrSvg = useMemo(() => generateQrSvg(url, 200), [url]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Waitlist QR Code - ${venueName}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: system-ui, sans-serif; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            p { font-size: 14px; color: #666; margin-top: 0; }
            .qr { margin: 24px 0; }
          </style>
        </head>
        <body>
          <h1>${venueName}</h1>
          <p>Scan to join the waitlist</p>
          <div class="qr">${qrSvg}</div>
          <p style="font-size: 11px; color: #999;">${url}</p>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative rounded-2xl w-full max-w-xs mx-4 overflow-hidden"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
            Waitlist QR Code
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md"
            style={{ color: 'var(--fnb-text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 text-center">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--fnb-text-primary)' }}>
            {venueName}
          </p>
          <p className="text-[10px] mb-4" style={{ color: 'var(--fnb-text-muted)' }}>
            Scan to join the waitlist
          </p>

          {/* QR Code */}
          <div
            className="inline-block rounded-xl p-3 mb-4"
            style={{ backgroundColor: '#fff', border: 'var(--fnb-border-subtle)' }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />

          <p
            className="text-[9px] break-all mb-4"
            style={{ color: 'var(--fnb-text-muted)', fontFamily: 'var(--fnb-font-mono)' }}
          >
            {url}
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-secondary)',
              }}
            >
              <Printer size={13} />
              Print
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(url);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95"
              style={{
                backgroundColor: 'var(--fnb-info)',
                color: '#fff',
              }}
            >
              <Download size={13} />
              Copy URL
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
