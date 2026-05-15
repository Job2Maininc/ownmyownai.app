import type { HTMLAttributes } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
