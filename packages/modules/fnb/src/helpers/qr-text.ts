/**
 * Renders a scannable QR code as centered plain text using Unicode
 * half-block characters (▀ ▄ █). Designed for 40-char thermal
 * printer output — the QR code is compact enough to fit.
 *
 * Uses the `qrcode` npm package's synchronous `create()` API
 * so this stays a pure function with no async overhead.
 */
import QRCode from 'qrcode';

const BLOCK_FULL = '\u2588'; // █  both halves dark
const BLOCK_TOP = '\u2580'; // ▀  top half dark
const BLOCK_BOTTOM = '\u2584'; // ▄  bottom half dark
const BLOCK_EMPTY = ' '; //    both halves light

/**
 * Generate a text-based QR code centered within `lineWidth` chars.
 * Each output line encodes TWO module rows using half-block chars,
 * halving the vertical footprint for thermal printers.
 *
 * A 1-module quiet zone is included on all sides (the QR spec
 * requires 4, but thermal printers have natural margins).
 */
export function renderQrText(
  data: string,
  lineWidth: number = 40,
): string {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });
  const { size } = qr.modules;

  // quiet zone of 1 module on each side
  const quiet = 1;
  const totalWidth = size + quiet * 2;

  // Helper: is module dark? (out-of-bounds = light for quiet zone)
  const isDark = (row: number, col: number): boolean => {
    if (row < 0 || row >= size || col < 0 || col >= size) return false;
    return qr.modules.get(row, col) === 1;
  };

  const lines: string[] = [];

  // Process two rows at a time for half-block encoding
  for (let y = -quiet; y < size + quiet; y += 2) {
    let line = '';
    for (let x = -quiet; x < size + quiet; x++) {
      const top = isDark(y, x);
      const bottom = isDark(y + 1, x);

      if (top && bottom) line += BLOCK_FULL;
      else if (top) line += BLOCK_TOP;
      else if (bottom) line += BLOCK_BOTTOM;
      else line += BLOCK_EMPTY;
    }

    // Center within lineWidth
    if (totalWidth < lineWidth) {
      const pad = Math.floor((lineWidth - totalWidth) / 2);
      line = ' '.repeat(pad) + line;
    }

    lines.push(line);
  }

  return lines.join('\n');
}
