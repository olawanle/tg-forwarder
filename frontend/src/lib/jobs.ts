import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Job } from "../api/types";

export const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function isActive(job: Job | null | undefined): boolean {
  return !!job && ACTIVE_STATUSES.has(job.status);
}

/** A clock that re-renders on an interval while `enabled`. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

/**
 * The profile's running broadcast, or failing that its most recent one.
 *
 * Polls fast while something is sending and slowly otherwise -- slowly
 * rather than never, so a scheduled broadcast starting on its own shows up
 * without a reload. Every screen uses the same query keys, so however many
 * of them are mounted there is one request per interval, not one each.
 */
export function useLiveJob(profileId: number | undefined, activePollMs = 3000) {
  const qc = useQueryClient();

  const active = useQuery({
    queryKey: ["active-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/active`),
    enabled: !!profileId,
    refetchInterval: (q) => (q.state.data && ACTIVE_STATUSES.has(q.state.data.status) ? activePollMs : 30_000),
  });

  const latest = useQuery({
    queryKey: ["latest-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/latest`),
    enabled: !!profileId && active.data === null,
  });

  // When a broadcast stops being active, the cached "latest" still describes
  // whichever job came before it -- refetch so its final state shows.
  const previousActiveId = useRef<number | null>(null);
  useEffect(() => {
    const id = active.data?.id ?? null;
    if (previousActiveId.current !== null && id === null) {
      qc.invalidateQueries({ queryKey: ["latest-job", profileId] });
      qc.invalidateQueries({ queryKey: ["send-log", profileId] });
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
      qc.invalidateQueries({ queryKey: ["trend", profileId] });
    }
    previousActiveId.current = id;
  }, [active.data?.id, profileId, qc]);

  const job = active.data ?? latest.data ?? null;
  return {
    job,
    running: isActive(job),
    /** Client clock time (ms) the active job was last fetched. */
    fetchedAt: active.dataUpdatedAt,
    isLoading: active.isLoading || (active.data === null && latest.isLoading),
  };
}

export interface LiveEta {
  /** Seconds until the last group is done, ticking down between polls. */
  secondsLeft: number;
  finishAt: Date;
  paceSeconds: number;
  measured: boolean;
  holding: boolean;
}

/**
 * Turns the server's estimate (a number of seconds, as of the moment it was
 * fetched) into a countdown.
 *
 * The countdown keeps its own finish time and only adopts a new one from the
 * server when it differs by more than a couple of seconds -- otherwise each
 * 2-second poll would nudge the clock back and forth by its rounding noise.
 * While the server says the current group is held up, the countdown stops
 * rather than promising a finish time it is about to miss.
 */
export function useEta(job: Job | null | undefined, fetchedAt: number): LiveEta | null {
  const has = !!job && job.status === "running" && job.eta_seconds != null;
  const [finishAt, setFinishAt] = useState<number | null>(null);
  const now = useNow(1000, has);

  const etaSeconds = has ? (job!.eta_seconds as number) : null;
  const holding = has && !!job!.eta_holding;

  useEffect(() => {
    if (etaSeconds === null) {
      setFinishAt(null);
      return;
    }
    const target = fetchedAt + etaSeconds * 1000;
    setFinishAt((current) => (current === null || holding || Math.abs(target - current) > 2500 ? target : current));
  }, [etaSeconds, holding, fetchedAt]);

  if (!has || etaSeconds === null) return null;
  const anchored = finishAt ?? fetchedAt + etaSeconds * 1000;
  const secondsLeft = holding ? etaSeconds : Math.max((anchored - now) / 1000, 0);
  return {
    secondsLeft,
    finishAt: new Date(now + secondsLeft * 1000),
    paceSeconds: job!.eta_pace_seconds ?? 0,
    measured: !!job!.eta_measured,
    holding,
  };
}

/** Elapsed time that keeps counting between polls for a running job. */
export function useElapsed(job: Job | null | undefined, fetchedAt: number): number | null {
  const live = isActive(job);
  const now = useNow(1000, live);
  if (!job || job.elapsed_seconds == null) return null;
  return live ? job.elapsed_seconds + Math.max(now - fetchedAt, 0) / 1000 : job.elapsed_seconds;
}

/** What to show for done/total. `done` can land a poll ahead of `total`. */
export function jobCounts(job: Job) {
  const done = Math.min(job.done, job.total || job.done);
  return { done, total: job.total, fraction: job.total ? Math.min(done / job.total, 1) : 0 };
}
