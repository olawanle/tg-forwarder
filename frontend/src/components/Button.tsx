import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "danger";

export function Button({
  variant = "primary",
  small = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  const variantClass =
    variant === "secondary"
      ? "pill-btn--secondary"
      : variant === "outline"
        ? "pill-btn--outline"
        : variant === "danger"
          ? "pill-btn--danger"
          : "";
  return (
    <button
      className={`pill-btn ${variantClass} ${small ? "pill-btn--sm" : ""} ${className}`.trim()}
      {...rest}
    />
  );
}
