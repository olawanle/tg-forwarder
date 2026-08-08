import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TrendPoint } from "../api/types";

function buildDailySeries(points: TrendPoint[], days: number) {
  const byDay = new Map(points.map((p) => [p.day, p]));
  const out: TrendPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = byDay.get(key);
    out.push({ day: key, sent: found?.sent ?? 0, errors: found?.errors ?? 0, total: found?.total ?? 0 });
  }
  return out;
}

export function TrendChart({ profileId }: { profileId: number | undefined }) {
  const [days, setDays] = useState<7 | 30>(7);
  const gradId = useId();

  const trend = useQuery({
    queryKey: ["trend", profileId, days],
    queryFn: () => api.get<TrendPoint[]>(`/profiles/${profileId}/stats/trend?days=${days}`),
    enabled: !!profileId,
  });

  const points = trend.data ?? [];
  const totalSent = points.reduce((s, p) => s + p.sent, 0);
  const totalErrors = points.reduce((s, p) => s + p.errors, 0);
  const successRate = totalSent + totalErrors > 0 ? (totalSent / (totalSent + totalErrors)) * 100 : 0;

  const series = useMemo(() => buildDailySeries(points, days), [points, days]);
  const max = Math.max(1, ...series.map((s) => s.sent));

  const w = 100;
  const h = 36;
  const stepX = series.length > 1 ? w / (series.length - 1) : w;
  const coords = series.map((s, i) => ({ x: i * stepX, y: h - (s.sent / max) * (h - 4) - 2 }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;
  const hasData = points.length > 0;

  return (
    <div className="glass-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Send trend</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
            <span className="mono">{totalSent}</span> sent · <span className="mono">{successRate.toFixed(1)}%</span> success ·{" "}
            last {days}d
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 999, background: "var(--glass-2)", border: "1px solid var(--stroke)" }}>
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 10px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                background: days === d ? "var(--accent-grad)" : "transparent",
                color: days === d ? "#fff" : "var(--text3)",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {trend.isLoading ? (
        <div style={{ height: 48 }} />
      ) : !hasData ? (
        <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "8px 0" }}>
          No sends in this window yet.
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 56, display: "block", overflow: "visible" }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
