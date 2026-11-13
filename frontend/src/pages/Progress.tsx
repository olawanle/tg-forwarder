import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../components/Icon";
import { Alert, Avatar, Button, Card, CardHead, Empty, PageHead, Pill, ResultPill, Ring, SkeletonRows, jobStatus } from "../components/ui";
import { useProfiles } from "../profile/ProfileContext";
import { api } from "../api/client";
import type { Job, JobResult } from "../api/types";
import { jobCounts, useEta, useElapsed, useLiveJob, type LiveEta } from "../lib/jobs";
import { durationParts, fmtClock, fmtDuration, fmtFinish, parseServerTime } from "../lib/time";

const COUNTERS: { key: string; label: string; color: string }[] = [
  { key: "ok", label: "Sent", color: "var(--ok)" },
  { key: "skipped_stars", label: "Stars", color: "var(--warn)" },
  { key: "auto_deleted", label: "Wiped", color: "var(--warn)" },
  { key: "other_skips", label: "Skipped", color: "var(--warn)" },
  { key: "errors", label: "Errors", color: "var(--bad)" },
];

function BigDuration({ seconds, holding = false }: { seconds: number; holding?: boolean }) {
  return (
    <div className={`eta-time ${holding ? "is-holding" : ""}`} aria-live="off">
      {durationParts(seconds).map(([n, unit]) => (
        <span key={unit}>
          {n}
          <small>{unit}</small>
        </span>
      ))}
    </div>
  );
}

/** "When will this be done?" -- the answer, and what it is based on. */
function EtaCard({ job, eta, elapsed }: { job: Job; eta: LiveEta | null; elapsed: number | null }) {
  const { done, total } = jobCounts(job);
  const left = Math.max(total - done, 0);

  if (job.status === "running" && eta) {
    const share = elapsed != null ? elapsed / Math.max(elapsed + eta.secondsLeft, 1) : 0;
    return (
      <Card>
        <div className="spread" style={{ marginBottom: 14 }}>
          <span className="eyebrow">Estimated completion</span>
          {eta.holding ? (
            <Pill tone="warn" dot>
              Held up
            </Pill>
          ) : eta.measured ? (
            <Pill tone="accent" live>
              Live
            </Pill>
          ) : (
            <Pill>Rough estimate</Pill>
          )}
        </div>
        <div className="cluster" style={{ alignItems: "baseline", gap: 10 }}>
          <BigDuration seconds={eta.secondsLeft} holding={eta.holding} />
          <span className="muted" style={{ fontSize: 14 }}>
            left
          </span>
        </div>
        <div className="eta-note">
          {eta.holding
            ? "This group is taking longer than usual, most likely a slowmode or flood wait. The clock picks up again once it is through."
            : eta.measured
              ? "Measured from how long this broadcast's groups are really taking, and updated after every one."
              : "Based on your delay setting for now. It sharpens after the first few groups."}
        </div>
        <div className="bar" style={{ marginTop: 16 }}>
          <i style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <div className="eta-cells">
          <div className="eta-cell">
            <span className="eyebrow">Done by</span>
            <b>{fmtFinish(eta.finishAt)}</b>
          </div>
          <div className="eta-cell">
            <span className="eyebrow">Pace</span>
            <b>{eta.paceSeconds.toFixed(1)}s / group</b>
          </div>
          <div className="eta-cell">
            <span className="eyebrow">Elapsed</span>
            <b>{fmtDuration(elapsed)}</b>
          </div>
        </div>
      </Card>
    );
  }

  if (job.status === "queued" || job.status === "running") {
    const finishing = job.status === "running" && total > 0 && left === 0;
    return (
      <Card>
        <div className="spread" style={{ marginBottom: 10 }}>
          <span className="eyebrow">Estimated completion</span>
          <Pill tone="accent" live>
            {finishing ? "Wrapping up" : "Getting ready"}
          </Pill>
        </div>
        <div className="section-title">{finishing ? "Finishing up…" : "Loading this account's groups…"}</div>
        <div className="eta-note">
          {finishing
            ? "Every group has been reached. Closing the broadcast out."
            : "The estimate appears as soon as the first message goes out."}
          {elapsed != null && <> Elapsed {fmtDuration(elapsed)}.</>}
        </div>
      </Card>
    );
  }

  const finishedAt = parseServerTime(job.updated_at);
  const pace = job.elapsed_seconds != null && done > 0 ? job.elapsed_seconds / done : null;
  const heading =
    job.status === "completed" ? "Finished in" : job.status === "interrupted" ? "Paused after" : "Stopped after";
  return (
    <Card>
      <div className="spread" style={{ marginBottom: 14 }}>
        <span className="eyebrow">{heading}</span>
        <Pill tone={jobStatus(job.status).tone}>{jobStatus(job.status).label}</Pill>
      </div>
      {job.elapsed_seconds != null ? <BigDuration seconds={job.elapsed_seconds} /> : <div className="eta-time">—</div>}
      {job.status === "interrupted" && (
        <div className="eta-note">
          {left} group{left === 1 ? "" : "s"} still to go. It picks itself up when the server is back, or resume it now.
        </div>
      )}
      <div className="eta-cells">
        <div className="eta-cell">
          <span className="eyebrow">{job.status === "completed" ? "Finished" : "Last update"}</span>
          <b>{fmtClock(finishedAt)}</b>
        </div>
        <div className="eta-cell">
          <span className="eyebrow">Avg pace</span>
          <b>{pace != null ? `${pace.toFixed(1)}s / group` : "—"}</b>
        </div>
        <div className="eta-cell">
          <span className="eyebrow">Reached</span>
          <b>
            {done} / {total || "?"}
          </b>
        </div>
      </div>
    </Card>
  );
}

export function Progress() {
  const { activeProfile } = useProfiles();
  const qc = useQueryClient();
  const profileId = activeProfile?.id;

  const { job, running, fetchedAt, isLoading } = useLiveJob(profileId, 2000);
  const eta = useEta(job, fetchedAt);
  const elapsed = useElapsed(job, fetchedAt);

  const results = useQuery({
    queryKey: ["job-results", job?.id],
    queryFn: () => api.get<JobResult[]>(`/profiles/${profileId}/jobs/${job!.id}/results`),
    enabled: !!job && !!profileId,
    refetchInterval: running ? 2000 : false,
  });

  // The last poll before a job ends can miss its final rows.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && job) qc.invalidateQueries({ queryKey: ["job-results", job.id] });
    wasRunning.current = running;
  }, [running, job, qc]);

  // Rows that arrived since the previous render slide in; the first load doesn't.
  const seen = useRef<Set<number> | null>(null);
  const rows = (results.data ?? []).slice(-200).reverse();
  const fresh = new Set<number>();
  if (seen.current) for (const r of rows) if (!seen.current.has(r.id)) fresh.add(r.id);
  useEffect(() => {
    if (results.data) seen.current = new Set(results.data.map((r) => r.id));
  }, [results.data]);
  useEffect(() => {
    seen.current = null;
  }, [job?.id]);

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
      <div className="page page--narrow">
        <PageHead title="Progress" />
        <Card>
          <Empty icon="users" title="No Telegram profile yet" action={<Link to="/profiles" className="btn btn--primary">Add a profile</Link>}>
            Connect a Telegram account to start broadcasting.
          </Empty>
        </Card>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page page--narrow">
        <PageHead title="Progress" sub={activeProfile.label} />
        <Card flush={isLoading}>
          {isLoading ? (
            <SkeletonRows count={3} />
          ) : (
            <Empty icon="progress" title="Nothing has gone out yet" action={<Link to="/compose" className="btn btn--primary">Write a broadcast</Link>}>
              When you start a broadcast, it shows up here live: every group, as it is reached.
            </Empty>
          )}
        </Card>
      </div>
    );
  }

  const { done, total, fraction } = jobCounts(job);
  const status = jobStatus(job.status);
  const isInterrupted = job.status === "interrupted";
  const summary = job.summary ?? {};
  const hasSummary = Object.keys(summary).length > 0;

  return (
    <div className="page">
      <PageHead
        title={running ? "Broadcasting" : "Progress"}
        sub={
          <>
            Job #{job.id} · {activeProfile.label} · runs on the server, so you can close this tab
          </>
        }
        actions={
          <>
            {running && (
              <Button variant="danger" icon="stop" onClick={cancel}>
                Cancel
              </Button>
            )}
            {isInterrupted && (
              <Button variant="primary" icon="play" onClick={resume}>
                Resume now
              </Button>
            )}
            {!running && !isInterrupted && (
              <Link to="/compose" className="btn btn--primary">
                <Icon name="send" size={17} />
                New broadcast
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid--progress">
        <div className="stack">
          <div className={`card card--hero ${running ? "" : "is-idle"}`}>
            <div className="hero">
              <Ring fraction={fraction} size={196} thickness={12} live={running}>
                <div>
                  <div className="ring-pct" style={{ fontSize: 46 }}>
                    {Math.round(fraction * 100)}
                    <small>%</small>
                  </div>
                  <div className="ring-cap">
                    <span className="num">{done}</span> of <span className="num">{total || "?"}</span> groups
                  </div>
                </div>
              </Ring>
              <Pill tone={status.tone} large live={running} dot={!running}>
                {status.label}
              </Pill>
              <div>
                <div className="now-name">{job.current_name || (running ? "Getting ready" : "—")}</div>
                {job.current_detail && <div className="now-detail">{job.current_detail}</div>}
              </div>
              {job.error && <Alert tone="bad">{job.error}</Alert>}
            </div>
          </div>

          <EtaCard job={job} eta={eta} elapsed={elapsed} />

          {hasSummary && (
            <div className="counters">
              {COUNTERS.map((c) => (
                <div className="counter" key={c.key}>
                  <b style={{ color: (summary[c.key] ?? 0) > 0 ? c.color : "var(--text-3)" }}>{summary[c.key] ?? 0}</b>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Card flush>
          <CardHead
            pad
            title="Live feed"
            sub={running ? "Newest first, as each group is reached" : "The most recent results of this broadcast"}
            end={
              <Pill mono>
                {job.delay_seconds}s delay
              </Pill>
            }
          />
          {results.isLoading ? (
            <SkeletonRows count={6} />
          ) : rows.length === 0 ? (
            <Empty icon="list" title="No results yet">
              {running ? "The first group will appear here in a moment." : "This broadcast did not reach any group."}
            </Empty>
          ) : (
            <div className="rows feed">
              {rows.map((r) => (
                <div className={`row ${fresh.has(r.id) ? "row--new" : ""}`} key={r.id}>
                  <Avatar name={r.target_name} size={34} />
                  <div className="row-main">
                    <div className="row-title">{r.target_name}</div>
                    <div className="row-sub">{r.detail || r.platform}</div>
                  </div>
                  <div className="row-end">
                    <span className="row-time only-desktop">{fmtClock(parseServerTime(r.created_at))}</span>
                    <ResultPill status={r.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
