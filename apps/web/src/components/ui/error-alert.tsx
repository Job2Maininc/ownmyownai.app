import Link from "next/link";
import type { UserError } from "@/lib/user-errors";

interface ErrorAlertProps extends UserError {
  onAction?: () => void;
  className?: string;
}

export function ErrorAlert({
  message,
  actionLabel,
  actionHref,
  onAction,
  className = "",
}: ErrorAlertProps) {
  const showAction = Boolean(actionLabel && (actionHref || onAction));

  return (
    <div className={`error-alert ${className}`.trim()} role="alert">
      <p className="error-alert__message">{message}</p>
      {showAction &&
        (actionHref ? (
          <Link href={actionHref} className="error-alert__action link">
            {actionLabel}
          </Link>
        ) : (
          <button type="button" className="error-alert__action" onClick={onAction}>
            {actionLabel}
          </button>
        ))}
    </div>
  );
}
