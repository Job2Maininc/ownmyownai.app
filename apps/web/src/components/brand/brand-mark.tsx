import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  variant?: "full" | "icon";
  size?: "sm" | "md";
  href?: string;
  className?: string;
};

const sizes = {
  sm: { icon: 24, full: { width: 140, height: 24 } },
  md: { icon: 32, full: { width: 180, height: 32 } },
};

export function BrandMark({
  variant = "full",
  size = "md",
  href,
  className = "",
}: BrandMarkProps) {
  const content =
    variant === "icon" ? (
      <Image
        src="/brand/icon.svg"
        alt="OwnMyOwnAI"
        width={sizes[size].icon}
        height={sizes[size].icon}
        priority
      />
    ) : (
      <Image
        src="/brand/logo.svg"
        alt="OwnMyOwnAI"
        width={sizes[size].full.width}
        height={sizes[size].full.height}
        priority
      />
    );

  if (href) {
    return (
      <Link href={href} className={`inline-flex items-center ${className}`}>
        {content}
      </Link>
    );
  }

  return <span className={`inline-flex items-center ${className}`}>{content}</span>;
}
