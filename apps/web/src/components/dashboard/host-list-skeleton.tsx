import { Card } from "@/components/ui/card";

export function HostListSkeleton() {
  return (
    <ul className="space-y-3">
      {[0, 1].map((i) => (
        <li key={i}>
          <Card className="animate-pulse">
            <div className="h-5 w-1/3 rounded bg-white/10" />
            <div className="mt-2 h-4 w-1/2 rounded bg-white/5" />
          </Card>
        </li>
      ))}
    </ul>
  );
}
