import type { CSSProperties, MouseEvent, ReactNode } from "react";

export function GlassCard({
  children,
  soft = false,
  premium = false,
  style,
  onClick,
}: {
  children: ReactNode;
  soft?: boolean;
  /** Subtle emerald-gradient hairline border + deeper shadow -- for the
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

  // The interactive specular glow (see components.css .glass-card) tracks
  // the pointer via these two custom properties; a plain style mutation
  // (not setState) so moving the mouse never triggers a React re-render --
  // the CSS transition on --glow-x/--glow-y is what gives it the soft
  // "spring" follow, same role as the reference's Animatable position.
  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--glow-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    e.currentTarget.style.setProperty("--glow-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }

  return (
    <div
      className={classes.join(" ")}
      style={{ ...(onClick ? { cursor: "pointer" } : {}), ...style }}
      onClick={onClick}
      onMouseMove={handleMove}
    >
      {/* Real element, not ::after -- Chromium won't repaint a custom
          property animated inside a gradient on a pseudo-element, but the
          identical pattern animates fine on an actual node. */}
      <div className="glass-card-rim" aria-hidden="true" />
      {children}
    </div>
  );
}
