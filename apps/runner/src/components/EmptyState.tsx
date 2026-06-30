import type { ReactNode } from "react";
import { EmptyStateIcon, type EmptyStateIconId } from "./Icons";

interface EmptyStateProps {
  icon: EmptyStateIconId;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "compact";
}

export default function EmptyState({
  icon,
  title,
  description,
  children,
  className = "",
  variant = "default",
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state empty-state--${variant} ${className}`.trim()}
      role="status"
    >
      <span className="empty-state__icon" aria-hidden>
        <EmptyStateIcon id={icon} size={variant === "compact" ? 18 : 22} />
      </span>
      <h3 className="empty-state__title">{title}</h3>
      <p className="empty-state__description">{description}</p>
      {children ? <div className="empty-state__actions">{children}</div> : null}
    </div>
  );
}

export function EmptyStatePanel(props: EmptyStateProps) {
  return (
    <div className="empty-state-panel">
      <EmptyState {...props} />
    </div>
  );
}
