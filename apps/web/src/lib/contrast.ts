/**
 * WCAG 2.1 relative luminance calculation + auto text color.
 *
 * Returns '#000000' or '#FFFFFF' based on the perceived brightness
 * of the given hex background color.  Uses the sRGB → linear
 * conversion specified in WCAG 2.1 §1.4.3.
 */
export function getContrastTextColor(hex: string): '#000000' | '#FFFFFF' {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}
