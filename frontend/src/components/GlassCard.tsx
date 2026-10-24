import type { CSSProperties, ReactNode } from "react";

export function GlassCard({
  children,
  soft = false,
  premium = false,
  style,
  onClick,
}: {
  children: ReactNode;
  soft?: boolean;
  /** Subtle gold-gradient hairline border + deeper shadow -- for the
      handful of surfaces that should read as this workspace's "private/
      premium" chrome (see theme.css --premium tokens), not a general
      emphasis style. */
  premium?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const classes = ["glass-card"];
  if (soft) classes.push("glass-card--soft");
  if (premium) classes.push("glass-card--premium");
  return (
    <div
      className={classes.join(" ")}
      style={{ ...(onClick ? { cursor: "pointer" } : {}), ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
