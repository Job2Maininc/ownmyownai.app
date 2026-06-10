type StatusVariant = "online" | "offline" | "pairing" | "warn";

const variants: Record<StatusVariant, { label: string; className: string }> = {
  online: {
    label: "En ligne",
    className: "status-pill status-pill--online",
  },
  offline: {
    label: "Hors ligne",
    className: "status-pill status-pill--offline",
  },
  pairing: {
    label: "En attente",
    className: "status-pill status-pill--pairing",
  },
  warn: {
    label: "Attention",
    className: "status-pill status-pill--warn",
  },
};

export function StatusPill({
  variant,
  label,
  className = "",
}: {
  variant: StatusVariant;
  label?: string;
  className?: string;
}) {
  const config = variants[variant];
  return (
    <span className={`${config.className} ${className}`}>
      <span className="status-pill__dot" aria-hidden />
      {label ?? config.label}
    </span>
  );
}
