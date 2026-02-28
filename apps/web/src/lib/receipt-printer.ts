/**
 * Receipt Printer — New Engine
 *
 * Prints ReceiptDocument via renderPrintHtml() using the same proven
 * hidden-iframe technique from pos-printer.ts.
 *
 * Print cascade (unchanged from pos-printer.ts):
 *   1. 80mm thermal printer (matched by @page size hints)
 *   2. System default printer
 *   3. Any available printer
 *   4. Save as PDF (browser print dialog)
 *
 * Uses a hidden iframe so the main POS UI is never disrupted.
 */

import { renderPrintHtml } from '@oppsera/shared';
import type { ReceiptDocument } from '@oppsera/shared';

// ── Print via hidden iframe ───────────────────────────────────────

/**
 * Print a ReceiptDocument using a hidden iframe.
 *
 * The renderPrintHtml() renderer produces a self-contained HTML document
 * with @page { size: 80mm auto; margin: 0; } — thermal printers pick
 * up the 80mm width automatically. The cascade is:
 *   80mm thermal → system default → any printer → save as PDF.
 */
export function printReceiptDocument(doc: ReceiptDocument): Promise<void> {
  const html = renderPrintHtml(doc);
  return printHtml(html);
}

/**
 * Print raw HTML string via hidden iframe.
 * This is the core print mechanism — identical to pos-printer.ts.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;width:80mm;height:0;border:none;visibility:hidden;';
    iframe.setAttribute('aria-hidden', 'true');

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        document.body.removeChild(iframe);
      } catch {
        /* already removed */
      }
      resolve();
    };

    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          cleanup();
          return;
        }

        doc.open();
        doc.write(html);
        doc.close();

        // Small delay to let content render before triggering print
        setTimeout(() => {
          try {
            const win = iframe.contentWindow;
            if (!win) {
              cleanup();
              return;
            }

            win.onafterprint = cleanup;
            win.print();

            // Safety timeout — some browsers never fire onafterprint
            setTimeout(cleanup, 60_000);
          } catch {
            cleanup();
          }
        }, 150);
      } catch {
        cleanup();
      }
    };

    iframe.onerror = cleanup;
    document.body.appendChild(iframe);
  });
}

// ── Backward-compat adapter ──────────────────────────────────────

/**
 * @deprecated Use `printReceiptDocument()` instead.
 *
 * Adapter that prints raw text lines via the same iframe technique.
 * Kept for backward compatibility with code that still uses
 * `buildReceiptLines()` from pos-printer.ts.
 */
export function printReceiptLines(rawLines: string[]): Promise<void> {
  const body = rawLines.map((line) => `<div>${line || '&nbsp;'}</div>`).join('\n');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page {
    size: 80mm auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 80mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
    background: #fff;
    padding: 2mm 3mm;
    white-space: pre;
    overflow-x: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

  return printHtml(html);
}
