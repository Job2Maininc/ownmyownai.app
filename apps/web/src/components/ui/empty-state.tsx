import type { ReactNode } from "react";

interface EmptyStateProps {
  emoji?: string;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  emoji,
  title,
  description,
  children,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      {emoji && (
        <span className="empty-state__emoji" aria-hidden>
          {emoji}
        </span>
      )}
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__description">{description}</p>
      {children && <div className="empty-state__actions">{children}</div>}
    </div>
  );
}
