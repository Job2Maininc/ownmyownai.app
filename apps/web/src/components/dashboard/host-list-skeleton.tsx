import { Card } from "@/components/ui/card";

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton-line ${className}`.trim()} aria-hidden />;
}

export function HostListSkeleton() {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Chargement des PCs">
      {[0, 1].map((i) => (
        <li key={i}>
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <SkeletonLine className="h-5 w-1/3" />
                <SkeletonLine className="h-4 w-1/4" />
              </div>
              <SkeletonLine className="h-9 w-20 rounded-full" />
            </div>
            <SkeletonLine className="h-4 w-2/3" />
            <div className="flex gap-2">
              <SkeletonLine className="h-6 w-24 rounded-full" />
              <SkeletonLine className="h-6 w-28 rounded-full" />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
