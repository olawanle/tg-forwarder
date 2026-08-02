import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { AvatarBadge, StatusPill, toneForStatus } from "../components/Small";
import { useProfiles } from "../profile/ProfileContext";
import { api } from "../api/client";
import type { SendLogEntry } from "../api/types";

type Filter = "All" | "Telegram" | "Discord" | "Errors";

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

  const grouped = useMemo(() => {
    const groups = new Map<string, SendLogEntry[]>();
    for (const r of filtered) {
      const day = r.created_at.slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(r);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  if (!activeProfile) {
    return (
      <div className="page">
        <h1 className="page-title">Send log</h1>
        <GlassCard>Add a Telegram profile first.</GlassCard>
      </div>
    );
  }

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Send log</h1>
        <div className="page-subtitle">Everything this profile has sent.</div>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {(["All", "Telegram", "Discord", "Errors"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              background: f === filter ? "var(--glass-3)" : "var(--glass-2)",
              color: f === filter ? "var(--text)" : "var(--text3)",
              border: "1px solid var(--stroke)",
              boxShadow: f === filter ? "var(--shadow)" : "none",
              fontFamily: "inherit",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <GlassCard>Loading…</GlassCard>
      ) : grouped.length === 0 ? (
        <GlassCard>No sends yet.</GlassCard>
      ) : (
        grouped.map(([day, entries]) => (
          <div key={day} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "var(--text3)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                padding: "4px 4px 0",
              }}
            >
              {day}
            </div>
            <GlassCard>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {entries.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "12px 4px",
                      borderTop: i === 0 ? "none" : "1px solid var(--hair)",
                    }}
                  >
                    <AvatarBadge seed={r.target_name} size={32} fontSize={12} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.target_name}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 1 }}>
                        {r.created_at.slice(11, 16)} · {r.platform}
                      </div>
                    </div>
                    <StatusPill label={r.status} tone={toneForStatus(r.status)} />
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        ))
      )}
    </div>
  );
}
