import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  variant?: "full" | "icon";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
};

const iconSizes = { sm: 28, md: 36, lg: 44 } as const;

export function BrandMark({
  variant = "full",
  size = "md",
  href,
  className = "",
}: BrandMarkProps) {
  const iconPx = iconSizes[size];

  const icon = (
    <Image
      src="/brand/icon.png"
      alt=""
      width={iconPx}
      height={iconPx}
      className="shrink-0 rounded-xl"
      priority
    />
  );

  const content =
    variant === "icon" ? (
      icon
    ) : (
      <span className="inline-flex items-center gap-2.5">
        {icon}
        <span
          className={`font-semibold tracking-tight text-[var(--foreground)] ${
            size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg"
          }`}
        >
          OwnMyOwn<span className="text-brand-500">AI</span>
        </span>
      </span>
    );

  const label = variant === "icon" ? "OwnMyOwnAI" : undefined;

  if (href) {
    return (
      <Link href={href} className={`inline-flex items-center ${className}`} aria-label="OwnMyOwnAI">
        {content}
      </Link>
    );
  }

  return (
    <span className={`inline-flex items-center ${className}`} aria-label={label}>
      {content}
    </span>
  );
}
