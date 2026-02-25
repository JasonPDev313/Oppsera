export default function TenantLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <div className="h-10 w-10 rounded-full border-4 border-[var(--portal-primary)] border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-[var(--portal-text-muted)]">Loading...</p>
      </div>
    </div>
  );
}
