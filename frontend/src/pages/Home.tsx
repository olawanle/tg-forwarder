import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../components/Icon";
import { Avatar, Card, CardHead, Empty, PageHead, Pill, ResultPill, Ring, Skeleton, SkeletonRows, jobStatus } from "../components/ui";
import { TrendChart, buildDailySeries, useTrend } from "../components/TrendChart";
import { BroadcastAllButton } from "../components/BroadcastAll";
import { useAuth } from "../auth/AuthContext";
import { useProfiles } from "../profile/ProfileContext";
import { api } from "../api/client";
import type { Job, SendLogEntry, Skip } from "../api/types";
import { jobCounts, useEta, useLiveJob, useNow, type LiveEta } from "../lib/jobs";
import { fmtAgo, fmtDuration, fmtFinish, parseServerTime } from "../lib/time";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function LiveCard({ job, running, eta }: { job: Job | null; running: boolean; eta: LiveEta | null }) {
  const navigate = useNavigate();
  if (!job) {
    return (
      <Card>
        <Empty icon="send" title="No broadcasts yet" action={<Link to="/compose" className="btn btn--primary">Write your first broadcast</Link>}>
          One message, sent to every group this account is in. Its progress will show up here.
        </Empty>
      </Card>
    );
  }
  const { done, total, fraction } = jobCounts(job);
  const status = jobStatus(job.status);
  return (
    <div className={`card card--hero card--link ${running ? "" : "is-idle"}`} onClick={() => navigate("/progress")} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && navigate("/progress")}>
      <div className="live">
        <Ring fraction={fraction} size={92} thickness={8} live={running}>
          <div className="ring-pct" style={{ fontSize: 22 }}>
            {Math.round(fraction * 100)}
            <small>%</small>
          </div>
        </Ring>
        <div className="live-body">
          <div className={`live-status ${running ? "is-live" : ""}`}>
            {running && <span className="dot dot--live" />}
            {running ? status.label : `Last broadcast · ${status.label}`}
          </div>
          <div className="live-title">
            <span className="num">{done}</span> of <span className="num">{total || "?"}</span> groups
          </div>
          <div className="live-now truncate">
            {running ? `Now: ${job.current_name || "getting ready"}` : `Job #${job.id}${job.elapsed_seconds != null ? ` · took ${fmtDuration(job.elapsed_seconds)}` : ""}`}
          </div>
          <div className="live-chips">
            <Pill mono>{job.delay_seconds}s delay</Pill>
            {eta && (
              <>
                <Pill tone={eta.holding ? "warn" : "accent"} mono>
                  ~{fmtDuration(eta.secondsLeft)} left
                </Pill>
                <Pill mono>done by {fmtFinish(eta.finishAt)}</Pill>
              </>
            )}
          </div>
        </div>
        <Icon name="chevronRight" size={18} className="faint" />
      </div>
    </div>
  );
}

function StatTile({ label, value, tone, foot }: { label: string; value: number | undefined; tone?: string; foot?: string }) {
  return (
    <Card tight>
      <div className="stat">
        <span className="eyebrow">{label}</span>
        {value === undefined ? <Skeleton width={56} height={28} /> : <span className="stat-value" style={{ color: tone }}>{value.toLocaleString()}</span>}
        {foot && <span className="stat-foot">{foot}</span>}
      </div>
    </Card>
  );
}

export function Home() {
  const { user } = useAuth();
  const { profiles, activeProfile, isLoading } = useProfiles();
  const profileId = activeProfile?.id;

  const { job, running, fetchedAt } = useLiveJob(profileId);
  const eta = useEta(job, fetchedAt);
  const now = useNow(30_000);

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
  const week = useTrend(profileId, 7);
  const today = week.data ? buildDailySeries(week.data, 1)[0] : undefined;

  const firstName = (user?.email.split("@")[0] ?? "there").split(/[._-]/)[0];
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  if (isLoading) {
    return (
      <div className="page">
        <Skeleton width={220} height={30} />
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="page page--narrow">
        <PageHead title={`Welcome, ${name}`} sub="Connect a Telegram account to get started." />
        <Card>
          <Empty icon="users" title="No Telegram profile yet" action={<Link to="/profiles" className="btn btn--primary">Add a profile</Link>}>
            A profile is one Telegram account. Broadcasts go out from it to every group it is in.
          </Empty>
        </Card>
      </div>
    );
  }

  const variants = activeProfile?.draft_messages.length ?? 0;
  const savedCount = activeProfile?.draft_saved_message_ids.length ?? 0;
  const draft =
    activeProfile?.draft_mode === "saved"
      ? `Using ${savedCount || 1} tagged Saved Message${savedCount > 1 ? "s" : ""} from Telegram.`
      : activeProfile?.draft_messages[0] || activeProfile?.draft_message || "";

  return (
    <div className="page">
      <PageHead
        title={`${greeting()}, ${name}`}
        sub={
          <>
            {activeProfile?.label}
            {activeProfile?.phone ? ` · ${activeProfile.phone}` : ""}
          </>
        }
        actions={
          <>
            <BroadcastAllButton className="only-desktop" />
            <Link to="/compose" className="btn btn--primary only-desktop">
              <Icon name="send" size={17} />
              New broadcast
            </Link>
          </>
        }
      />
      <div className="only-mobile">
        <BroadcastAllButton block />
      </div>

      <div className="grid grid--main">
        <LiveCard job={job} running={running} eta={eta} />
        <Card>
          <CardHead title="Draft" end={<Link to="/compose" className="link">Edit</Link>} />
          <div className="hint" style={{ whiteSpace: "pre-wrap", color: draft ? "var(--text-2)" : undefined, fontSize: 13.5, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {draft || "Nothing drafted yet. Write the message you want every group to get."}
          </div>
          <div className="spread" style={{ marginTop: 14 }}>
            <div className="cluster">
              {activeProfile?.draft_mode !== "saved" && variants > 1 && <Pill mono>{variants} variants</Pill>}
              {!activeProfile?.has_session && <Pill tone="bad" dot>No session</Pill>}
            </div>
            <Link to="/compose" className="btn btn--sm">
              Open Compose
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid grid--stats">
        <StatTile label="Sent today" value={week.isLoading ? undefined : (today?.sent ?? 0)} tone="var(--ok)" />
        <StatTile label="Errors today" value={week.isLoading ? undefined : (today?.errors ?? 0)} tone={(today?.errors ?? 0) > 0 ? "var(--bad)" : undefined} />
        <StatTile label="Blacklisted" value={skips.data?.length} tone={(skips.data?.length ?? 0) > 0 ? "var(--warn)" : undefined} />
        <StatTile label="Discord channels" value={discordSelection.data?.length} />
      </div>

      <div className="grid grid--main">
        <TrendChart profileId={profileId} />
        <Card flush>
          <CardHead pad title="Recent activity" end={<Link to="/log" className="link">View all</Link>} />
          {recent.isLoading ? (
            <SkeletonRows count={5} />
          ) : (recent.data ?? []).length === 0 ? (
            <Empty icon="list" title="No sends yet" />
          ) : (
            <div className="rows">
              {(recent.data ?? []).slice(0, 6).map((r) => (
                <div className="row row--tight" key={r.id}>
                  <Avatar name={r.target_name} size={32} />
                  <div className="row-main">
                    <div className="row-title">{r.target_name}</div>
                    <div className="row-sub">{fmtAgo(parseServerTime(r.created_at), now)}</div>
                  </div>
                  <ResultPill status={r.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
