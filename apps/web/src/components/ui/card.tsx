import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className = "", interactive = false, children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-soft ${
        interactive ? "card-interactive" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
