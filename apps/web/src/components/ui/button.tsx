import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({
  className = "",
  variant = "primary",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-[background,color,box-shadow,transform] duration-200 ease-out disabled:opacity-50";
  const variants = {
    primary:
      "bg-brand-500 text-[var(--accent-foreground)] shadow-sm hover:bg-brand-600 hover:shadow-card",
    secondary:
      "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]",
    ghost: "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
