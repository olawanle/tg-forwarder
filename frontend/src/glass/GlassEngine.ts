// True Liquid Glass rendering engine -- ported from the "real-liquid-glass"
// technique (https://github.com/sehgalvansh716-pixel/True-Liquid-Glass):
// a per-frame SVG displacement map traced from the element's own
// border-radius (a signed-distance-field "lens" centered on the pointer),
// fed through a chromatic-aberration feDisplacementMap chain so the red/
// green/blue channels refract by slightly different amounts -- genuine
// optical-feeling distortion, not a blurred rectangle with a name. No
// framework dependency: plain DOM/Canvas/SVG, same as the source.

export interface GlassOptions {
  displacementScale: number;
  blurAmount: number;
  chromaticAberration: number;
  edgeHighlightIntensity: number;
  bulge: number;
  noiseFrequency: number;
  lensStrength: number;
  edgeCurvature: number;
  enableMouseTracking: boolean;
  borderRadius: number;
  tintColor: string;
  tintIntensity: number;
  edgeGlowColor: string;
}

export const GLASS_DEFAULTS: GlassOptions = {
  displacementScale: 20,
  blurAmount: 5,
  chromaticAberration: 3,
  edgeHighlightIntensity: 1.0,
  bulge: 0.0,
  noiseFrequency: 0.04,
  lensStrength: 1.0,
  edgeCurvature: 0,
  enableMouseTracking: true,
  borderRadius: 24,
  tintColor: "#ffffff",
  tintIntensity: 0.05,
  edgeGlowColor: "#ffffff",
};

// "Steep Bevel" -- the preset the reference page itself defaults to for
// dashboard-style cards: flat center, intense sharp bevel right at the
// border radius, no cursor tracking (cheap, doesn't fight the pointer glow
// GlassCard already does for ordinary cards).
export const GLASS_PRESET_BEVEL: GlassOptions = {
  displacementScale: 60,
  blurAmount: 1,
  chromaticAberration: 4,
  edgeHighlightIntensity: 4.0,
  bulge: 1.0,
  noiseFrequency: 0.01,
  lensStrength: 0.2,
  edgeCurvature: 30,
  enableMouseTracking: false,
  borderRadius: 24,
  tintColor: "#ffffff",
  tintIntensity: 0.05,
  edgeGlowColor: "#ffffff",
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { r: 255, g: 255, b: 255 };
}

export class GlassEngine {
  private el: HTMLElement;
  private options: GlassOptions;
  private mouse = { x: 0.5, y: 0.5 };
  private target = { x: 0.5, y: 0.5 };
  private hover = false;
  private raf: number | null = null;
  private roRaf: number | null = null;
  private lastSize = "";
  private id: string;
  private svg: SVGSVGElement;
  private filter: SVGFilterElement;
  private ro: ResizeObserver;
  private canvas?: HTMLCanvasElement;
  private ctx?: CanvasRenderingContext2D;
  private onMove: (e: PointerEvent) => void;
  private onLeave: () => void;

  constructor(el: HTMLElement, options: Partial<GlassOptions> = {}) {
    this.el = el;
    this.options = { ...GLASS_DEFAULTS, ...options };
    this.id = "glass-filter-" + Math.random().toString(36).slice(2, 11);

    const NS = "http://www.w3.org/2000/svg";
    this.svg = document.createElementNS(NS, "svg") as SVGSVGElement;
    Object.assign(this.svg.style, { position: "absolute", width: "0", height: "0" });
    this.svg.setAttribute("aria-hidden", "true");
    this.filter = document.createElementNS(NS, "filter") as SVGFilterElement;
    for (const [k, v] of [
      ["id", this.id],
      ["x", "-20%"],
      ["y", "-20%"],
      ["width", "140%"],
      ["height", "140%"],
      ["filterUnits", "objectBoundingBox"],
      ["primitiveUnits", "userSpaceOnUse"],
    ]) {
      this.filter.setAttribute(k, v);
    }
    this.svg.appendChild(this.filter);
    document.body.appendChild(this.svg);

    this.onMove = (e: PointerEvent) => {
      if (!this.options.enableMouseTracking) return;
      const r = this.el.getBoundingClientRect();
      this.target.x = (e.clientX - r.left) / r.width;
      this.target.y = (e.clientY - r.top) / r.height;
      this.hover = true;
      this.start();
    };
    this.onLeave = () => {
      if (!this.options.enableMouseTracking) return;
      this.target.x = 0.5;
      this.target.y = 0.5;
      this.hover = false;
      this.start();
    };
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);

    this.ro = new ResizeObserver(() => {
      if (this.roRaf) return;
      this.roRaf = requestAnimationFrame(() => {
        this.roRaf = null;
        const r = this.el.getBoundingClientRect();
        const s = Math.round(r.width) + "x" + Math.round(r.height);
        if (s !== this.lastSize) {
          this.lastSize = s;
          this.updateFilter();
        }
      });
    });
    this.ro.observe(el);
    this.updateStyles();
  }

  private start() {
    if (this.raf == null) this.tick();
  }

  private tick = () => {
    const dx = this.target.x - this.mouse.x;
    const dy = this.target.y - this.mouse.y;
    this.mouse.x += dx * 0.1;
    this.mouse.y += dy * 0.1;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      this.mouse.x = this.target.x;
      this.mouse.y = this.target.y;
      if (!this.hover && this.mouse.x === 0.5 && this.mouse.y === 0.5) {
        this.raf = null;
        return;
      }
    }
    if (this.options.bulge > 0) this.updateFilter();
    this.raf = requestAnimationFrame(this.tick);
  };

  // Low-res (max 64px) signed-distance-field normal map: encodes, per
  // pixel, the direction away from the pointer (R/G channels) attenuated
  // by distance from the rounded-rect edge, so feDisplacementMap reads it
  // as "push outward near the lens center, snap flat at the border
  // radius." 64px is plenty since the GPU upsamples it smoothly via
  // feImage, and keeps this cheap enough to regenerate every frame while
  // the bulge is tracking the cursor.
  private normalMap(w: number, h: number): string {
    const scale = Math.min(1, 64 / Math.max(w, h));
    const cw = Math.max(1, Math.ceil(w * scale));
    const ch = Math.max(1, Math.ceil(h * scale));
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d") ?? undefined;
    }
    if (!this.ctx) return "";
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const img = this.ctx.createImageData(cw, ch);
    const d = img.data;
    let br = this.options.borderRadius;
    if (br >= Math.min(w, h) / 2) br = Math.min(w, h) / 2;
    const cx = w * this.mouse.x;
    const cy = h * this.mouse.y;
    const hw = w / 2;
    const hh = h / 2;
    const { lensStrength, edgeCurvature } = this.options;
    const maxD = Math.max(w, h);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const px = x / scale;
        const py = y / scale;
        const dx = px - cx;
        const dy = py - cy;
        const dm = Math.sqrt(dx * dx + dy * dy);
        const nx = dm > 0 ? dx / dm : 0;
        const ny = dm > 0 ? dy / dm : 0;
        const qx = Math.abs(px - hw) - hw + br;
        const qy = Math.abs(py - hh) - hh + br;
        const mx = Math.max(qx, 0);
        const my = Math.max(qy, 0);
        const de = -(Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - br);
        let m = (dm / (maxD * 0.8)) * lensStrength;
        if (edgeCurvature > 0 && de > 0 && de < edgeCurvature) {
          m += Math.pow(1 - de / edgeCurvature, 3) * 1.5;
        }
        if (de < 0) m = 0;
        m = Math.min(1, m);
        const i = (y * cw + x) * 4;
        d[i] = nx * m * 127 + 128;
        d[i + 1] = ny * m * 127 + 128;
        d[i + 2] = 255;
        d[i + 3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL("image/png");
  }

  private updateFilter() {
    const { displacementScale: s, chromaticAberration: c, bulge, noiseFrequency } = this.options;
    const r = this.el.getBoundingClientRect();
    const w = r.width || 100;
    const h = r.height || 100;
    const src =
      bulge > 0
        ? `<feImage href="${this.normalMap(w, h)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="dispMap" />`
        : `<feTurbulence type="fractalNoise" baseFrequency="${noiseFrequency}" numOctaves="2" result="dispMap" />`;
    this.filter.innerHTML =
      src +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />' +
      `<feDisplacementMap in="red" in2="dispMap" scale="${s + c}" xChannelSelector="R" yChannelSelector="G" result="dispRed" />` +
      `<feDisplacementMap in="green" in2="dispMap" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="dispGreen" />` +
      `<feDisplacementMap in="blue" in2="dispMap" scale="${Math.max(0, s - c)}" xChannelSelector="R" yChannelSelector="G" result="dispBlue" />` +
      '<feComposite in="dispRed" in2="dispGreen" operator="arithmetic" k2="1" k3="1" result="rg" />' +
      '<feComposite in="rg" in2="dispBlue" operator="arithmetic" k2="1" k3="1" result="final" />';
  }

  updateStyles() {
    this.updateFilter();
    const o = this.options;
    const g = hexToRgb(o.edgeGlowColor);
    const t = hexToRgb(o.tintColor);
    const k = o.edgeHighlightIntensity;
    const bf = `url(#${this.id}) blur(${o.blurAmount}px)`;
    this.el.style.backdropFilter = bf;
    this.el.style.setProperty("-webkit-backdrop-filter", bf);
    this.el.style.boxShadow = `inset 1px 1px 4px rgba(${g.r},${g.g},${g.b},${Math.min(1, 0.6 * k)}), inset -1px -1px 4px rgba(0,0,0,${Math.min(1, 0.4 * k)}), 0 0 0 1px rgba(${g.r},${g.g},${g.b},${Math.min(1, 0.2 * k)}), 0 12px 40px rgba(0,0,0,0.3)`;
    this.el.style.backgroundColor = `rgba(${t.r},${t.g},${t.b},${o.tintIntensity})`;
    this.el.style.transform = "translateZ(0)";
  }

  setOptions(options: Partial<GlassOptions>) {
    Object.assign(this.options, options);
    if (!this.options.enableMouseTracking) {
      this.target.x = 0.5;
      this.target.y = 0.5;
      this.hover = false;
      this.start();
    }
    this.updateStyles();
  }

  setBorderRadius(radius: number) {
    this.options.borderRadius = radius;
    this.updateStyles();
  }

  destroy() {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    if (this.roRaf != null) cancelAnimationFrame(this.roRaf);
    this.ro.disconnect();
    this.el.removeEventListener("pointermove", this.onMove);
    this.el.removeEventListener("pointerleave", this.onLeave);
    this.svg.remove();
  }
}
