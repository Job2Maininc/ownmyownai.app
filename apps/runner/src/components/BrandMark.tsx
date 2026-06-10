type BrandMarkProps = {
  size?: "sm" | "md";
  className?: string;
};

export function BrandMark({ size = "md", className = "" }: BrandMarkProps) {
  const iconSize = size === "sm" ? 28 : 36;
  return (
    <div className={`brand-mark ${className}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 32 32" fill="none" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent-dim)" />
        <circle cx="16" cy="16" r="10" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
        <circle cx="16" cy="16" r="3.5" fill="var(--accent)" />
        <path
          d="M16 6 A10 10 0 0 1 24 14"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-mark__text">
        OwnMyOwn<span className="brand-mark__accent">AI</span>
      </span>
      <span className="brand-mark__host">Host</span>
    </div>
  );
}
