import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GlassEngine, GLASS_PRESET_BEVEL } from "../glass/GlassEngine";
import type { GlassOptions } from "../glass/GlassEngine";

function radiusOf(el: HTMLElement): number {
  const r = getComputedStyle(el).borderRadius;
  if (r.includes("%")) return 9999;
  return parseInt(r) || 0;
}

/** The handful of marquee cards (Home's live-job card, Compose's Broadcast
    Summary, Progress's ring card) get the real per-element SVG-displacement
    liquid glass engine -- genuine optical refraction, not a blurred
    rectangle. Everything else (stat tiles, group cards, log rows) stays on
    the cheap static CSS approximation in components.css -- running this
    canvas+SVG engine on every card on the page would be wasteful for
    content that's rarely looked at up close. */
export function GlassHero({
  children,
  options,
  className = "",
  style,
}: {
  children: ReactNode;
  options?: Partial<GlassOptions>;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const engine = useRef<GlassEngine | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    engine.current = new GlassEngine(el, { ...GLASS_PRESET_BEVEL, borderRadius: radiusOf(el) });
    return () => engine.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.current?.setOptions(options ?? {});
  }, [options]);

  return (
    <div ref={ref} className={`glass-hero ${className}`} style={style}>
      {children}
    </div>
  );
}
