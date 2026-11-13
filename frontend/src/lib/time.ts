/** Server timestamps arrive as Python's str(datetime) --
 * "2026-10-25 09:27:08.101895+00:00" -- which is not ISO 8601 (a space, six
 * fractional digits) and which Safari refuses to parse. Normalise first. */
export function parseServerTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  let s = value.trim().replace(" ", "T");
  s = s.replace(/(\.\d{3})\d+/, "$1");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayShort = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const dateTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/** "3:42 PM" in the viewer's own time zone. */
export function fmtClock(d: Date | null): string {
  return d ? clock.format(d) : "—";
}

export function fmtDateTime(d: Date | null): string {
  return d ? dateTime.format(d) : "—";
}

export function fmtWeekday(d: Date): string {
  return weekday.format(d);
}

/** Local calendar day as YYYY-MM-DD (for grouping; not for display). */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDay(d: Date, now: Date = new Date()): string {
  const key = dayKey(d);
  if (key === dayKey(now)) return "Today";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return "Yesterday";
  return dayShort.format(d);
}

/** "42s", "8m 21s", "1h 12m", "2d 3h" -- always two units at most. */
export function fmtDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** The same duration split for a big-number display: [["8","m"],["21","s"]]. */
export function durationParts(totalSeconds: number): [string, string][] {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return [[String(s), "s"]];
  const m = Math.floor(s / 60);
  if (m < 60)
    return [
      [String(m), "m"],
      [String(s % 60).padStart(2, "0"), "s"],
    ];
  const h = Math.floor(m / 60);
  if (h < 24)
    return [
      [String(h), "h"],
      [String(m % 60).padStart(2, "0"), "m"],
    ];
  return [
    [String(Math.floor(h / 24)), "d"],
    [String(h % 24), "h"],
  ];
}

export function fmtAgo(d: Date | null, nowMs: number = Date.now()): string {
  if (!d) return "—";
  const s = Math.max(0, Math.round((nowMs - d.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return "yesterday";
  return dayShort.format(d);
}

/** "3:42 PM", or "tomorrow 12:10 AM" when it crosses midnight. */
export function fmtFinish(finish: Date, now: Date = new Date()): string {
  if (dayKey(finish) === dayKey(now)) return clock.format(finish);
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  if (dayKey(finish) === dayKey(t)) return `tomorrow ${clock.format(finish)}`;
  return dateTime.format(finish);
}
