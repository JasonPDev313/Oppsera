/**
 * Embed layout — breaks out of the guest layout's 480px card constraint.
 * Uses fixed positioning to fill the full viewport (iframe dimensions).
 * The guest layout card is still rendered behind this overlay but invisible.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-surface">
      {children}
    </div>
  );
}
