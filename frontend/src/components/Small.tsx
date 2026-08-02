import type { ReactNode } from "react";

export function IconButton({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel: string;
}) {
  return (
    <button className="icon-btn" onClick={onClick} aria-label={ariaLabel} type="button">
      {children}
    </button>
  );
}

export function ToggleSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    >
      <span className="knob" />
    </button>
  );
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const AVATAR_GRADIENTS = [
  "linear-gradient(160deg,#6ee7f9,#2a7dff)",
  "linear-gradient(160deg,#c58bff,#7a3ff2)",
  "linear-gradient(160deg,#7ef0d0,#12a594)",
  "linear-gradient(160deg,#ffc46b,#f76b1c)",
  "linear-gradient(160deg,#ffa1c4,#e5484d)",
  "linear-gradient(160deg,#9ce88a,#2fa84f)",
  "linear-gradient(160deg,#9db2ff,#4353d9)",
];

function hashToIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AvatarBadge({
  seed,
  size = 44,
  fontSize = 15,
}: {
  seed: string;
  size?: number;
  fontSize?: number;
}) {
  const gradient = AVATAR_GRADIENTS[hashToIndex(seed, AVATAR_GRADIENTS.length)];
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize, background: gradient }}
    >
      {initials(seed)}
    </span>
  );
}

type PillTone = "ok" | "warn" | "bad" | "neutral";

export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const styles: Record<PillTone, { bg: string; fg: string }> = {
    ok: { bg: "var(--ok-soft)", fg: "var(--ok)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
    bad: { bg: "var(--bad-soft)", fg: "var(--bad)" },
    neutral: { bg: "var(--glass-2)", fg: "var(--text2)" },
  };
  const s = styles[tone];
  return (
    <span className="status-pill" style={{ background: s.bg, color: s.fg }}>
      {label}
    </span>
  );
}

export function toneForStatus(status: string): PillTone {
  if (status === "ok" || status === "sent" || status === "left") return "ok";
  if (status === "error") return "bad";
  if (status.startsWith("skipped") || status === "auto_deleted" || status === "wiped")
    return "warn";
  return "neutral";
}
