import type { HTMLAttributes } from "react";

export function Card({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-soft ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
