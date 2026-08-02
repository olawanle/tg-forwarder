import type { CSSProperties, ReactNode } from "react";

export function GlassCard({
  children,
  soft = false,
  style,
  onClick,
}: {
  children: ReactNode;
  soft?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      className={soft ? "glass-card glass-card--soft" : "glass-card"}
      style={{ ...(onClick ? { cursor: "pointer" } : {}), ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
