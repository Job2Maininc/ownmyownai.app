export function ChatConnectingSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4" aria-hidden>
      <div className="h-4 w-32 rounded bg-[var(--border)]" />
      <div className="h-20 rounded-lg bg-[var(--border)]/60" />
      <div className="h-12 rounded-lg bg-[var(--border)]/40" />
    </div>
  );
}

export function ContextUploadSkeleton() {
  return (
    <div className="animate-pulse rounded border border-dashed border-[var(--border)] p-4" aria-hidden>
      <div className="mx-auto h-3 w-40 rounded bg-[var(--border)]" />
      <div className="mx-auto mt-2 h-2 w-24 rounded bg-[var(--border)]/60" />
    </div>
  );
}
