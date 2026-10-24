/**
 * Real Liquid Glass refracts whatever is behind it -- it doesn't just blur
 * it. backdrop-filter accepts an SVG filter reference alongside blur()/
 * saturate(), so a feTurbulence + feDisplacementMap pair here (very low
 * frequency, applied only at the surface) gently warps the backdrop the
 * way a curved lens would, instead of only softening it.
 *
 * Mounted once, globally (App.tsx) -- every .glass-card etc. references the
 * same filter id via backdrop-filter: ... url(#liquid-glass-distortion) in
 * components.css. Zero-size and non-interactive; this renders nothing
 * visible on its own.
 */
export function LiquidGlassDefs() {
  return (
    <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <filter id="liquid-glass-distortion" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.009 0.012"
          numOctaves={2}
          seed={7}
          result="noise"
        />
        <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softNoise"
          scale="14"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
