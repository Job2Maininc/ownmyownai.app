function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`skeleton-line ${className}`.trim()} aria-hidden />;
}

export function ChatConnectingSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Connexion au Host">
      <SkeletonBar className="h-4 w-32" />
      <SkeletonBar className="h-20 rounded-lg" />
      <SkeletonBar className="h-12 rounded-lg" />
    </div>
  );
}

export function ContextUploadSkeleton() {
  return (
    <div className="rounded border border-dashed border-[var(--border)] p-4" aria-hidden>
      <SkeletonBar className="mx-auto h-3 w-40" />
      <SkeletonBar className="mx-auto mt-2 h-2 w-24" />
    </div>
  );
}
