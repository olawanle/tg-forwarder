import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { AvatarBadge, StatusPill, toneForStatus } from "../components/Small";
import { MiniProgressRing } from "../components/ProgressRing";
import { useAuth } from "../auth/AuthContext";
import { useProfiles } from "../profile/ProfileContext";
import { api } from "../api/client";
import type { Job, SendLogEntry, Skip } from "../api/types";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { profiles, activeProfile, setActiveProfileId, isLoading } = useProfiles();
  const profileId = activeProfile?.id;

  const activeJob = useQuery({
    queryKey: ["active-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/active`),
    enabled: !!profileId,
    refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.has(q.state.data.status) ? 3000 : false),
  });

  const skips = useQuery({
    queryKey: ["skips", profileId],
    queryFn: () => api.get<Skip[]>(`/profiles/${profileId}/skips`),
    enabled: !!profileId,
  });

  const discordSelection = useQuery({
    queryKey: ["discord-selection", profileId],
    queryFn: () => api.get<string[]>(`/profiles/${profileId}/discord-selection`),
    enabled: !!profileId,
  });

  const recent = useQuery({
    queryKey: ["send-log", profileId],
    queryFn: () => api.get<SendLogEntry[]>(`/profiles/${profileId}/send-log`),
    enabled: !!profileId,
  });

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600 }}>{user?.email}</div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <Link
          to="/profiles"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px 5px 5px",
            borderRadius: 999,
            background: "var(--glass)",
            border: "1px solid var(--stroke)",
            backdropFilter: "blur(20px)",
            boxShadow: "var(--shadow)",
          }}
        >
          <AvatarBadge seed={activeProfile?.label || "?"} size={30} fontSize={12.5} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Link>
      </div>

      {isLoading ? (
        <GlassCard>Loading…</GlassCard>
      ) : profiles.length === 0 ? (
        <GlassCard>
          No Telegram profiles yet.{" "}
          <Link to="/profiles" style={{ fontWeight: 700 }}>
            Add one
          </Link>{" "}
          to get started.
        </GlassCard>
      ) : (
        <>
          {activeJob.data &&
            (() => {
              const j = activeJob.data!;
              // See Progress.tsx: clamp so an out-of-order poll can never
              // render done > total, even for a moment.
              const doneDisplay = Math.min(j.done, j.total || j.done);
              const fraction = j.total ? doneDisplay / j.total : 0;
              return (
                <GlassCard onClick={() => navigate("/progress")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <MiniProgressRing fraction={fraction} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "var(--ok)",
                            animation: "glassPulse 1.8s ease-in-out infinite",
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ok)", textTransform: "capitalize" }}>
                          {j.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 3 }}>
                        Job #{j.id} · {doneDisplay} of {j.total || "?"}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--text2)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        Now: {j.current_name || "—"}
                      </div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                </GlassCard>
              );
            })()}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="glass-card--soft" style={{ border: "1px solid var(--stroke)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--warn)" }}>
                {skips.data?.length ?? "—"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text2)", fontWeight: 600, marginTop: 2 }}>
                Blacklisted
              </div>
            </div>
            <div className="glass-card--soft" style={{ border: "1px solid var(--stroke)" }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>
                {discordSelection.data?.length ?? "—"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text2)", fontWeight: 600, marginTop: 2 }}>
                Discord channels
              </div>
            </div>
          </div>

          <GlassCard>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  Quick broadcast
                </span>
                <Link to="/compose" style={{ fontSize: 12.5, fontWeight: 700 }}>
                  Edit
                </Link>
              </div>
              <div
                style={{
                  background: "var(--field)",
                  boxShadow: "var(--field-in)",
                  borderRadius: 18,
                  padding: "13px 14px",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: "var(--text2)",
                  minHeight: 20,
                }}
              >
                {activeProfile?.draft_mode === "saved"
                  ? "Using a tagged Saved Message"
                  : activeProfile?.draft_message || "No draft yet — write one in Compose."}
              </div>
              <button
                type="button"
                onClick={() => navigate("/compose")}
                style={{
                  height: 50,
                  border: "none",
                  borderRadius: 999,
                  background: "linear-gradient(180deg, #3cc0f5, #229ed9)",
                  boxShadow: "0 10px 24px rgba(34,158,217,0.4), inset 0 1.5px 0 rgba(255,255,255,0.5)",
                  color: "#fff",
                  fontFamily: "inherit",
                  fontSize: 15.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Go to Compose
              </button>
            </div>
          </GlassCard>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>Recent</span>
            <Link to="/log" style={{ fontSize: 12.5, fontWeight: 700 }}>
              See all
            </Link>
          </div>
          <GlassCard>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {(recent.data ?? []).length === 0 && (
                <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
                  No sends yet.
                </div>
              )}
              {(recent.data ?? []).slice(0, 4).map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 4px",
                    borderTop: i === 0 ? "none" : "1px solid var(--hair)",
                  }}
                >
                  <AvatarBadge seed={r.target_name} size={36} fontSize={13} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.target_name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>
                      {r.created_at.slice(0, 16).replace("T", " ")}
                    </div>
                  </div>
                  <StatusPill label={r.status} tone={toneForStatus(r.status)} />
                </div>
              ))}
            </div>
          </GlassCard>

          {profiles.length > 1 && (
            <GlassCard>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Switch profile</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProfileId(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 16,
                      border: p.id === activeProfile?.id ? "1.5px solid var(--accent)" : "1px solid var(--stroke)",
                      background: "var(--field)",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      color: "var(--text)",
                    }}
                  >
                    <AvatarBadge seed={p.label} size={30} fontSize={11.5} />
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.label}</span>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}

      <button
        type="button"
        onClick={logout}
        style={{
          textAlign: "center",
          fontSize: 13.5,
          fontWeight: 700,
          color: "var(--bad)",
          padding: 10,
          cursor: "pointer",
          background: "none",
          border: "none",
        }}
      >
        Log out
      </button>
    </div>
  );
}
