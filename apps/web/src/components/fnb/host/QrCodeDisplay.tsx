'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Copy, Check, Download, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';

interface QrBranding {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  welcomeHeadline: string;
  footerText: string | null;
}

interface QrCodeDisplayProps {
  open: boolean;
  onClose: () => void;
  venueName: string;
  slug: string;
  branding?: QrBranding | null;
}

const DEFAULT_BRANDING: QrBranding = {
  logoUrl: null,
  primaryColor: '#6366f1',
  secondaryColor: '#3b82f6',
  accentColor: '#22c55e',
  fontFamily: 'Inter',
  welcomeHeadline: 'Join Our Waitlist',
  footerText: null,
};

function buildFlyerHtml(
  qrDataUrl: string,
  venueName: string,
  waitlistUrl: string,
  b: QrBranding,
): string {
  const logoSection = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="${venueName}" style="max-height:80px;max-width:220px;object-fit:contain;margin-bottom:12px;" crossorigin="anonymous" />`
    : '';

  const footer = b.footerText || 'Powered by OppsEra';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Waitlist QR - ${venueName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=${b.fontFamily.replace(/ /g, '+')}:wght@400;600;700;800&display=swap');

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
      size: letter;
      margin: 0;
    }

    body {
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      font-family: '${b.fontFamily}', 'Inter', system-ui, sans-serif;
      color: #1a1a2e;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .flyer {
      width: 7.5in;
      min-height: 10in;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    /* Top accent bar */
    .accent-bar {
      width: 100%;
      height: 8px;
      background: linear-gradient(90deg, ${b.primaryColor}, ${b.secondaryColor});
    }

    /* Decorative corner elements */
    .corner-decor {
      position: absolute;
      width: 120px;
      height: 120px;
      opacity: 0.06;
    }
    .corner-decor.top-left {
      top: 20px;
      left: 20px;
      border-top: 4px solid ${b.primaryColor};
      border-left: 4px solid ${b.primaryColor};
    }
    .corner-decor.top-right {
      top: 20px;
      right: 20px;
      border-top: 4px solid ${b.primaryColor};
      border-right: 4px solid ${b.primaryColor};
    }
    .corner-decor.bottom-left {
      bottom: 20px;
      left: 20px;
      border-bottom: 4px solid ${b.primaryColor};
      border-left: 4px solid ${b.primaryColor};
    }
    .corner-decor.bottom-right {
      bottom: 20px;
      right: 20px;
      border-bottom: 4px solid ${b.primaryColor};
      border-right: 4px solid ${b.primaryColor};
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 40px 32px;
      text-align: center;
    }

    .logo { margin-bottom: 8px; }

    .venue-name {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #1a1a2e;
      margin-bottom: 32px;
    }

    .divider {
      width: 80px;
      height: 3px;
      background: linear-gradient(90deg, ${b.primaryColor}, ${b.secondaryColor});
      border-radius: 2px;
      margin-bottom: 32px;
    }

    .headline {
      font-size: 22px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: ${b.primaryColor};
      margin-bottom: 36px;
    }

    .qr-frame {
      background: #fff;
      border: 3px solid #f0f0f5;
      border-radius: 20px;
      padding: 20px;
      margin-bottom: 36px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }

    .qr-frame img {
      display: block;
      width: 280px;
      height: 280px;
    }

    .instructions {
      font-size: 16px;
      line-height: 1.6;
      color: #555;
      max-width: 380px;
      margin-bottom: 12px;
    }

    .instructions strong {
      color: #1a1a2e;
    }

    .no-app {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: ${b.primaryColor}10;
      border: 1px solid ${b.primaryColor}25;
      border-radius: 20px;
      padding: 6px 16px;
      font-size: 13px;
      font-weight: 600;
      color: ${b.primaryColor};
      margin-bottom: 32px;
    }

    .url-display {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 11px;
      color: #999;
      word-break: break-all;
      margin-bottom: 32px;
    }

    .divider-bottom {
      width: 80px;
      height: 3px;
      background: linear-gradient(90deg, ${b.secondaryColor}, ${b.primaryColor});
      border-radius: 2px;
      margin-bottom: 16px;
    }

    .footer {
      font-size: 12px;
      color: #aaa;
      letter-spacing: 0.5px;
    }

    /* Bottom accent bar */
    .accent-bar-bottom {
      width: 100%;
      height: 8px;
      background: linear-gradient(90deg, ${b.secondaryColor}, ${b.primaryColor});
      margin-top: auto;
    }

    @media print {
      body { background: #fff; }
    }
  </style>
</head>
<body>
  <div class="flyer">
    <div class="accent-bar"></div>
    <div class="corner-decor top-left"></div>
    <div class="corner-decor top-right"></div>
    <div class="corner-decor bottom-left"></div>
    <div class="corner-decor bottom-right"></div>

    <div class="content">
      <div class="logo">${logoSection}</div>
      <div class="venue-name">${venueName}</div>
      <div class="divider"></div>
      <div class="headline">Scan to Join Our Waitlist</div>
      <div class="qr-frame">
        <img src="${qrDataUrl}" alt="Scan to join waitlist" />
      </div>
      <div class="instructions">
        Point your <strong>phone camera</strong> at the QR code to join our waitlist instantly.
      </div>
      <div class="no-app">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        No app needed
      </div>
      <div class="url-display">${waitlistUrl}</div>
      <div class="divider-bottom"></div>
      <div class="footer">${footer}</div>
    </div>
    <div class="accent-bar-bottom"></div>
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
}

export function QrCodeDisplay({
  open,
  onClose,
  venueName,
  slug,
  branding,
}: QrCodeDisplayProps) {
  const b = branding ?? DEFAULT_BRANDING;
  const waitlistUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/waitlist/${slug}`;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate real QR code
  useEffect(() => {
    if (!open || !waitlistUrl) return;
    let cancelled = false;
    QRCode.toDataURL(waitlistUrl, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => { cancelled = true; };
  }, [open, waitlistUrl]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(buildFlyerHtml(qrDataUrl, venueName, waitlistUrl, b));
    printWindow.document.close();
  };

  const handleDownloadPng = async () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `waitlist-qr-${slug}.png`;
    a.click();
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
        className="relative rounded-2xl w-full max-w-sm mx-4 overflow-hidden"
        style={{ backgroundColor: 'var(--fnb-bg-surface, hsl(232 25% 13%))' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--fnb-border-subtle, hsl(232 15% 22%))' }}
        >
          <h2 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary, #f1f5f9)' }}>
            Waitlist QR Code
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md"
            style={{ color: 'var(--fnb-text-muted, #94a3b8)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 text-center">
          {/* Logo */}
          {b.logoUrl && (
            <img
              src={b.logoUrl}
              alt={venueName}
              className="mx-auto mb-2 max-h-10 max-w-[140px] object-contain"
            />
          )}

          <p className="text-sm font-bold mb-0.5" style={{ color: 'var(--fnb-text-primary, #f1f5f9)' }}>
            {venueName}
          </p>
          <p className="text-[10px] mb-4" style={{ color: 'var(--fnb-text-muted, #94a3b8)' }}>
            Scan to join the waitlist
          </p>

          {/* QR Code */}
          <div
            className="inline-block rounded-xl p-3 mb-4"
            style={{ backgroundColor: '#fff', border: '1px solid var(--fnb-border-subtle, hsl(232 15% 22%))' }}
          >
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Waitlist QR Code" width={200} height={200} />
            ) : (
              <div className="flex items-center justify-center" style={{ width: 200, height: 200 }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--fnb-text-muted, #94a3b8)' }} />
              </div>
            )}
          </div>

          <p
            className="text-[9px] break-all mb-4 font-mono"
            style={{ color: 'var(--fnb-text-muted, #94a3b8)' }}
          >
            {waitlistUrl}
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95 disabled:opacity-40"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated, hsl(232 20% 18%))',
                color: 'var(--fnb-text-secondary, #cbd5e1)',
              }}
            >
              <Download size={13} />
              QR Image
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95 disabled:opacity-40"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated, hsl(232 20% 18%))',
                color: 'var(--fnb-text-secondary, #cbd5e1)',
              }}
            >
              <Printer size={13} />
              Print Flyer
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(waitlistUrl);
                setCopied(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2.5 transition-all active:scale-95"
              style={{
                backgroundColor: copied ? 'var(--fnb-success, #22c55e)' : 'var(--fnb-info, #6366f1)',
                color: '#fff',
                transition: 'background-color 200ms ease',
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
