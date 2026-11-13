import { useEffect, useId } from "react";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
}) {
  return (
    <button
      type={type}
      className={cx(
        "btn",
        variant !== "secondary" && `btn--${variant}`,
        size !== "md" && `btn--${size}`,
        block && "btn--block",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" /> : icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  style,
  flush = false,
  tight = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  flush?: boolean;
  tight?: boolean;
}) {
  return (
    <div className={cx("card", flush && "card--flush", tight && "card--tight", className)} style={style}>
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  end,
  pad = false,
}: {
  title: ReactNode;
  sub?: ReactNode;
  end?: ReactNode;
  /** For flush cards, where the body has no padding of its own. */
  pad?: boolean;
}) {
  return (
    <div className="card-head" style={pad ? { padding: "18px 20px 0", marginBottom: 10 } : undefined}>
      <div className="grow">
        <div className="card-title">{title}</div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {end}
    </div>
  );
}

/* --------------------------------------------------------------- Fields */

export function Field({ label, hint, children }: { label?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && (
        <span className="hint" style={{ display: "block", marginTop: 6 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("input", className)} {...rest} />;
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
  inline = false,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  inline?: boolean;
}) {
  return (
    <div className={cx("tabs", inline && "tabs--inline")} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="count num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label?: string }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format = (v) => String(v),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="slider-head">
        <label htmlFor={id} className="setting-title">
          {label}
        </label>
        <span className="slider-value">{format(value)}</span>
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Pills */

export type Tone = "ok" | "warn" | "bad" | "info" | "accent" | "neutral";

export function Pill({
  tone = "neutral",
  children,
  dot = false,
  live = false,
  mono = false,
  large = false,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  live?: boolean;
  mono?: boolean;
  large?: boolean;
}) {
  return (
    <span className={cx("pill", tone !== "neutral" && `pill--${tone}`, mono && "pill--mono", large && "pill--lg")}>
      {(dot || live) && <span className={cx("dot", live && "dot--live")} />}
      {children}
    </span>
  );
}

const RESULT_LABELS: Record<string, string> = {
  ok: "Sent",
  sent: "Sent",
  left: "Left",
  error: "Error",
  auto_deleted: "Wiped",
  wiped: "Wiped",
  skipped_stars: "Stars",
  stars_required: "Stars",
  skipped_slowmode: "Slowmode",
  skipped_forbidden: "No permission",
  skipped_banned: "Banned",
  skipped_private: "Private",
  skipped: "Skipped",
};

export function resultTone(status: string): Tone {
  if (status === "ok" || status === "sent" || status === "left") return "ok";
  if (status === "error") return "bad";
  if (status.startsWith("skipped") || status === "auto_deleted" || status === "wiped" || status === "stars_required")
    return "warn";
  return "neutral";
}

export function resultLabel(status: string): string {
  return RESULT_LABELS[status] ?? status.replace(/^skipped_/, "").replace(/_/g, " ");
}

/** Outcome of one send (ok, error, skipped_slowmode, …). */
export function ResultPill({ status }: { status: string }) {
  return <Pill tone={resultTone(status)}>{resultLabel(status)}</Pill>;
}

const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  queued: { label: "Starting", tone: "accent" },
  running: { label: "Sending", tone: "accent" },
  completed: { label: "Completed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  failed: { label: "Failed", tone: "bad" },
  interrupted: { label: "Paused", tone: "warn" },
  scheduled: { label: "Scheduled", tone: "info" },
};

export function jobStatus(status: string): { label: string; tone: Tone } {
  return JOB_STATUS[status] ?? { label: status, tone: "neutral" };
}

/* --------------------------------------------------------------- Avatar */

function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const h = hue(name);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: `hsl(${h} 34% 17%)`,
        color: `hsl(${h} 82% 76%)`,
        boxShadow: `inset 0 0 0 1px hsl(${h} 40% 27%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------- Sheet/modal */

/** Bottom sheet on a phone, centred dialog from tablet width up. */
export function Sheet({
  children,
  onClose,
  wide = false,
}: {
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className={cx("sheet", wide && "sheet--wide")} role="dialog" aria-modal="true">
        <div className="sheet-grabber" />
        {children}
      </div>
    </>,
    document.body,
  );
}

/* -------------------------------------------------------- Feedback bits */

export function Alert({ tone = "neutral", children }: { tone?: "ok" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const icon: IconName = tone === "ok" ? "check" : tone === "neutral" ? "info" : "alert";
  return (
    <div className={cx("alert", tone !== "neutral" && `alert--${tone}`)} role={tone === "bad" ? "alert" : undefined}>
      <Icon name={icon} size={16} />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={20} />
      </div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 14, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return <div className="skel" style={{ width, height, ...style }} />;
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="rows">
      {Array.from({ length: count }, (_, i) => (
        <div className="row" key={i}>
          <Skeleton width={34} height={34} style={{ borderRadius: "30%" }} />
          <div className="row-main">
            <Skeleton width={`${46 + ((i * 17) % 30)}%`} />
            <Skeleton width="28%" height={10} style={{ marginTop: 7 }} />
          </div>
          <Skeleton width={52} height={20} style={{ borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- Ring */

export function Ring({
  fraction,
  size = 96,
  thickness = 8,
  live = false,
  children,
}: {
  fraction: number;
  size?: number;
  thickness?: number;
  /** Adds the two slow ripples that say "this is going out right now". */
  live?: boolean;
  children?: ReactNode;
}) {
  const gradId = useId();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      {live && (
        <>
          <span className="ring-ripple" />
          <span className="ring-ripple" />
        </>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent-2)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={`url(#${gradId})`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="grow">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
