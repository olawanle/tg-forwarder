import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { TrendPoint } from "../api/types";
import { Card, CardHead, Empty, Skeleton, Tabs } from "./ui";

/** The server buckets by UTC day, so the series is keyed the same way. */
function utcKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildDailySeries(points: TrendPoint[], days: number): TrendPoint[] {
  const byDay = new Map(points.map((p) => [p.day, p]));
  const out: TrendPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = utcKey(d);
    const found = byDay.get(key);
    out.push({ day: key, sent: found?.sent ?? 0, errors: found?.errors ?? 0, total: found?.total ?? 0 });
  }
  return out;
}

export function useTrend(profileId: number | undefined, days: number) {
  return useQuery({
    queryKey: ["trend", profileId, days],
    queryFn: () => api.get<TrendPoint[]>(`/profiles/${profileId}/stats/trend?days=${days}`),
    enabled: !!profileId,
  });
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export function TrendChart({ profileId }: { profileId: number | undefined }) {
  const [days, setDays] = useState<"7" | "30">("7");
  const n = Number(days);
  const trend = useTrend(profileId, n);

  const series = useMemo(() => buildDailySeries(trend.data ?? [], n), [trend.data, n]);
  const sent = series.reduce((s, p) => s + p.sent, 0);
  const errors = series.reduce((s, p) => s + p.errors, 0);
  const max = Math.max(1, ...series.map((p) => p.sent + p.errors));
  const rate = sent + errors > 0 ? (sent / (sent + errors)) * 100 : null;

  return (
    <Card>
      <CardHead
        title="Activity"
        sub={
          <>
            <span className="mono">{sent.toLocaleString()}</span> sent
            {rate !== null && (
              <>
                {" · "}
                <span className="mono">{rate.toFixed(1)}%</span> delivered
              </>
            )}
          </>
        }
        end={
          <Tabs
            inline
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />
      {trend.isLoading ? (
        <Skeleton height={148} style={{ borderRadius: 12 }} />
      ) : sent + errors === 0 ? (
        <Empty icon="chart" title="Nothing sent in this window">
          Your daily totals will show up here.
        </Empty>
      ) : (
        <>
          <div className="chart" style={{ gap: n > 7 ? 3 : 10 }}>
            {series.map((p, i) => {
              const total = p.sent + p.errors;
              const d = new Date(`${p.day}T00:00:00Z`);
              const showLabel = n === 7 || i % 5 === 4 || i === series.length - 1;
              return (
                <div className="chart-col" key={p.day}>
                  <div className="chart-tip">
                    <b>{monthDay.format(d)}</b> · {p.sent} sent{p.errors ? ` · ${p.errors} errors` : ""}
                  </div>
                  <div className={`chart-bar ${total === 0 ? "is-empty" : ""}`} style={{ height: `${(total / max) * 100}%` }}>
                    {p.errors > 0 && <i style={{ height: `${Math.max((p.errors / total) * 100, 4)}%` }} />}
                  </div>
                  <div className="chart-x">{showLabel ? (n === 7 ? weekday.format(d) : d.getUTCDate()) : ""}</div>
                </div>
              );
            })}
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            <span>
              <i style={{ background: "var(--accent)" }} />
              Sent
            </span>
            <span>
              <i style={{ background: "var(--bad)" }} />
              Errors
            </span>
          </div>
        </>
      )}
    </Card>
  );
}
