import type { ReactNode } from "react";
import { FeatureIcon, type IconName } from "@/components/ui/icon";

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  children,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      {icon && <FeatureIcon name={icon} className="empty-state__icon" />}
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__description">{description}</p>
      {children && <div className="empty-state__actions">{children}</div>}
    </div>
  );
}
