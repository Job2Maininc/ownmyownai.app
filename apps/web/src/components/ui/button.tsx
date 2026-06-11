import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "lg";
}

export function Button({
  className = "",
  variant = "primary",
  size = "default",
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-semibold transition-[background,color,box-shadow,transform,border-color] duration-base ease-expo disabled:opacity-50 active:scale-[0.98]";
  const sizes = {
    default: "rounded-full px-5 py-2.5 text-sm",
    lg: "rounded-full px-8 py-3.5 text-base",
  };
  const variants = {
    primary:
      "bg-brand-500 text-white shadow-soft hover:bg-brand-600 hover:shadow-card",
    secondary:
      "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-soft hover:bg-[var(--surface-hover)] hover:border-[color-mix(in_srgb,var(--border)_60%,var(--link))]",
    ghost:
      "rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
