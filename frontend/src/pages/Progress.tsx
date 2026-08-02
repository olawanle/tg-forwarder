import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { ProgressRing } from "../components/ProgressRing";
import { AvatarBadge, StatusPill, toneForStatus } from "../components/Small";
import { useProfiles } from "../profile/ProfileContext";
import { api } from "../api/client";
import type { Job, JobResult } from "../api/types";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function Progress() {
  const { activeProfile } = useProfiles();
  const qc = useQueryClient();
  const profileId = activeProfile?.id;

  const activeJob = useQuery({
    queryKey: ["active-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/active`),
    enabled: !!profileId,
    refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.has(q.state.data.status) ? 2000 : false),
  });

  const latestJob = useQuery({
    queryKey: ["latest-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/latest`),
    enabled: !!profileId && activeJob.data === null,
  });

  const job = activeJob.data ?? latestJob.data;

  const results = useQuery({
    queryKey: ["job-results", job?.id],
    queryFn: () => api.get<JobResult[]>(`/profiles/${profileId}/jobs/${job!.id}/results`),
    enabled: !!job && !!profileId,
    refetchInterval: job && ACTIVE_STATUSES.has(job.status) ? 2000 : false,
  });

  async function cancel() {
    if (!profileId) return;
    await api.post(`/profiles/${profileId}/broadcast/cancel`);
    qc.invalidateQueries({ queryKey: ["active-job", profileId] });
  }

  async function resume() {
    if (!profileId) return;
    await api.post(`/profiles/${profileId}/broadcast/resume`);
    qc.invalidateQueries({ queryKey: ["active-job", profileId] });
  }

  if (!activeProfile) {
    return (
      <div className="page">
        <h1 className="page-title">Progress</h1>
        <GlassCard>Add a Telegram profile first.</GlassCard>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page">
        <h1 className="page-title">Progress</h1>
        <GlassCard>No broadcast jobs yet for this profile. Start one from Compose.</GlassCard>
      </div>
    );
  }

  const total = job.total || 1;
  const fraction = Math.min(job.done / total, 1);
  const isRunning = job.status === "running" || job.status === "queued";
  const isInterrupted = job.status === "interrupted";

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Progress</h1>
        <div className="page-subtitle">
          Job #{job.id} · {job.status} · runs on the server
        </div>
      </div>

      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <ProgressRing
            fraction={fraction}
            spinning={isRunning}
            center={
              <>
                <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1 }}>
                  {job.done}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)" }}>
                  of {job.total || "?"} groups
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 7,
                    padding: "4px 11px",
                    borderRadius: 999,
                    background: isRunning ? "var(--ok-soft)" : "var(--glass-2)",
                  }}
                >
                  {isRunning && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--ok)",
                        animation: "glassPulse 1.8s ease-in-out infinite",
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: isRunning ? "var(--ok)" : "var(--text2)",
                      textTransform: "capitalize",
                    }}
                  >
                    {job.status}
                  </span>
                </div>
              </>
            }
          />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{job.current_name || "—"}</div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 3 }}>
              {job.current_detail || ""}
            </div>
          </div>
          {job.error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{job.error}</div>}
          <div style={{ display: "flex", gap: 9, width: "100%" }}>
            {isRunning && (
              <Button variant="danger" onClick={cancel}>
                Cancel
              </Button>
            )}
            {isInterrupted && (
              <Button variant="secondary" onClick={resume}>
                Resume now
              </Button>
            )}
          </div>
        </div>
      </GlassCard>

      {job.summary && Object.keys(job.summary).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { key: "ok", label: "Sent", bg: "var(--ok-soft)", fg: "var(--ok)" },
            { key: "skipped_stars", label: "Stars skipped", bg: "var(--warn-soft)", fg: "var(--warn)" },
            { key: "auto_deleted", label: "Auto-deleted", bg: "var(--warn-soft)", fg: "var(--warn)" },
            { key: "errors", label: "Errors", bg: "var(--bad-soft)", fg: "var(--bad)" },
          ].map((s) => (
            <div
              key={s.key}
              className="glass-card--soft"
              style={{ display: "flex", alignItems: "center", gap: 11, border: "1px solid var(--stroke)" }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: s.bg,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 15,
                  fontWeight: 800,
                  color: s.fg,
                  flexShrink: 0,
                }}
              >
                {job.summary[s.key] ?? 0}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text2)", lineHeight: 1.3 }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", padding: "0 4px" }}>
        Live feed
      </div>
      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {(results.data ?? []).length === 0 && (
            <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>
              No results yet.
            </div>
          )}
          {(results.data ?? [])
            .slice(-200)
            .reverse()
            .map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "12px 4px",
                  borderTop: "1px solid var(--hair)",
                }}
              >
                <AvatarBadge seed={r.target_name} size={30} fontSize={11.5} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.target_name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.detail}
                  </div>
                </div>
                <StatusPill label={r.status} tone={toneForStatus(r.status)} />
              </div>
            ))}
        </div>
      </GlassCard>
    </div>
  );
}
