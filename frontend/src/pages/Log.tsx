import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Card, Empty, PageHead, ResultPill, SkeletonRows } from "../components/ui";
import { useProfiles } from "../profile/ProfileContext";
import { api } from "../api/client";
import type { SendLogEntry } from "../api/types";
import { dayKey, fmtClock, fmtDay, parseServerTime } from "../lib/time";

type Filter = "All" | "Telegram" | "Discord" | "Errors";
const FILTERS: Filter[] = ["All", "Telegram", "Discord", "Errors"];

export function Log() {
  const { activeProfile } = useProfiles();
  const [filter, setFilter] = useState<Filter>("All");
  const profileId = activeProfile?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["send-log", profileId],
    queryFn: () => api.get<SendLogEntry[]>(`/profiles/${profileId}/send-log`),
    enabled: !!profileId,
  });

  const rows = data ?? [];
  const filtered = useMemo(() => {
    if (filter === "All") return rows;
    if (filter === "Telegram") return rows.filter((r) => r.platform === "telegram");
    if (filter === "Discord") return rows.filter((r) => r.platform === "discord");
    return rows.filter((r) => r.status === "error");
  }, [rows, filter]);

  // Grouped by the viewer's own calendar day, not the server's.
  const grouped = useMemo(() => {
    const groups = new Map<string, { date: Date; entries: { row: SendLogEntry; at: Date | null }[] }>();
    for (const row of filtered) {
      const at = parseServerTime(row.created_at);
      const key = at ? dayKey(at) : "unknown";
      if (!groups.has(key)) groups.set(key, { date: at ?? new Date(0), entries: [] });
      groups.get(key)!.entries.push({ row, at });
    }
    return Array.from(groups.entries());
  }, [filtered]);

  if (!activeProfile) {
    return (
      <div className="page page--narrow">
        <PageHead title="Send log" />
        <Card>
          <Empty icon="users" title="No Telegram profile yet" action={<Link to="/profiles" className="btn btn--primary">Add a profile</Link>} />
        </Card>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <PageHead title="Send log" sub={`The latest sends from ${activeProfile.label}.`} />

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={f === filter} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card flush>
          <SkeletonRows count={6} />
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <Empty icon="list" title={filter === "All" ? "No sends yet" : `No ${filter.toLowerCase()} in the log`}>
            {filter === "All" ? "Every message a broadcast sends is recorded here." : "Try another filter."}
          </Empty>
        </Card>
      ) : (
        grouped.map(([key, group]) => (
          <section key={key}>
            <div className="eyebrow day-label">{fmtDay(group.date)}</div>
            <Card flush>
              <div className="rows">
                {group.entries.map(({ row, at }) => (
                  <div className="row row--tight" key={row.id}>
                    <Avatar name={row.target_name} size={32} />
                    <div className="row-main">
                      <div className="row-title">{row.target_name}</div>
                      <div className="row-sub">
                        {fmtClock(at)} · <span style={{ textTransform: "capitalize" }}>{row.platform}</span>
                        {row.detail && row.status !== "ok" ? ` · ${row.detail}` : ""}
                      </div>
                    </div>
                    <ResultPill status={row.status} />
                  </div>
                ))}
              </div>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
