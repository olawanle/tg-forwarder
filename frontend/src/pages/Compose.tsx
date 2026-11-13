import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, CardHead, Empty, PageHead, Slider, Switch, Tabs, Textarea } from "../components/ui";
import { useProfiles } from "../profile/ProfileContext";
import { api, ApiError } from "../api/client";
import type { AppSettings, Job, SavedMessage } from "../api/types";
import { fmtDateTime, fmtDuration, parseServerTime } from "../lib/time";

type Mode = "text" | "saved";
const MAX_VARIANTS = 5;
/** What a group costs on top of the delay when no earlier run says otherwise. */
const DEFAULT_OVERHEAD_SECONDS = 2;

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function Compose() {
  const { activeProfile } = useProfiles();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("text");
  const [messages, setMessages] = useState<string[]>([""]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const [delay, setDelay] = useState(3);
  const [maxSlow, setMaxSlow] = useState(300);
  const [includeDiscord, setIncludeDiscord] = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000)));
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [staleNotice, setStaleNotice] = useState("");

  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!activeProfile) return;
    setMode(activeProfile.draft_mode === "saved" ? "saved" : "text");
    const draftMessages = activeProfile.draft_messages.length
      ? activeProfile.draft_messages
      : activeProfile.draft_message
        ? [activeProfile.draft_message]
        : [""];
    setMessages(draftMessages);
    setSavedIds(
      activeProfile.draft_saved_message_ids.length
        ? activeProfile.draft_saved_message_ids
        : activeProfile.draft_saved_message_id
          ? [activeProfile.draft_saved_message_id]
          : [],
    );
  }, [activeProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultDelay = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<AppSettings>("/settings"),
    staleTime: 5 * 60 * 1000,
  });
  const appliedDefaultDelay = useRef(false);
  useEffect(() => {
    if (appliedDefaultDelay.current || defaultDelay.data === undefined) return;
    appliedDefaultDelay.current = true;
    setDelay(defaultDelay.data.default_delay_seconds);
  }, [defaultDelay.data]);

  const activeJob = useQuery({
    queryKey: ["active-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/active`),
    enabled: !!profileId,
  });

  // The last broadcast tells us how many groups this account reaches and
  // how long each one really took -- a far better basis for "how long will
  // this take" than the delay alone.
  const latestJob = useQuery({
    queryKey: ["latest-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/latest`),
    enabled: !!profileId,
  });

  const scheduledJobs = useQuery({
    queryKey: ["scheduled-jobs", profileId],
    queryFn: () => api.get<Job[]>(`/profiles/${profileId}/jobs/scheduled`),
    enabled: !!profileId,
  });

  const savedMessages = useQuery({
    queryKey: ["saved-messages", profileId],
    queryFn: () => api.get<SavedMessage[]>(`/profiles/${profileId}/saved-messages`),
    enabled: false,
  });

  // Saved-message selections are IDs persisted on the profile's draft. If
  // one is later deleted or untagged in Telegram its ID would linger
  // invisibly (absent from the fetched list, but still sent to the backend
  // and rotated into, causing real send errors). Fetch the live tagged list
  // once on entering saved mode with a selection, and prune to what's valid.
  const autoFetchedSaved = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "saved" || !profileId || savedIds.length === 0) return;
    if (autoFetchedSaved.current === profileId) return;
    autoFetchedSaved.current = profileId;
    savedMessages.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profileId, savedIds.length]);

  useEffect(() => {
    if (!savedMessages.data) return;
    const validIds = new Set(savedMessages.data.map((m) => m.id));
    setSavedIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length !== prev.length) {
        setStaleNotice(
          prev.length - next.length === 1
            ? "1 previously selected message is no longer tagged in Telegram and was removed from your selection."
            : `${prev.length - next.length} previously selected messages are no longer tagged in Telegram and were removed from your selection.`,
        );
      }
      return next;
    });
  }, [savedMessages.data]);

  const selection = useQuery({
    queryKey: ["discord-selection", profileId],
    queryFn: () => api.get<string[]>(`/profiles/${profileId}/discord-selection`),
    enabled: !!profileId,
  });

  const cleanMessages = messages.map((m) => m.trim()).filter(Boolean);

  const start = useMutation({
    mutationFn: () =>
      api.post<Job>(`/profiles/${profileId}/broadcast/start`, {
        mode,
        message: mode === "text" ? cleanMessages[0] ?? "" : "",
        source_message_id: mode === "saved" ? savedIds[0] ?? null : null,
        messages: mode === "text" ? cleanMessages : undefined,
        source_message_ids: mode === "saved" ? savedIds : undefined,
        scheduled_at: scheduleOn && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        delay_seconds: delay,
        max_slowmode_wait: maxSlow,
        include_discord: includeDiscord,
      }),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ["active-job", profileId] });
      qc.invalidateQueries({ queryKey: ["scheduled-jobs", profileId] });
      if (job.status === "scheduled") {
        setSaveNotice(`Scheduled for ${fmtDateTime(parseServerTime(job.scheduled_at))}.`);
      } else {
        navigate("/progress");
      }
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start broadcast."),
  });

  const cancelScheduled = useMutation({
    mutationFn: (jobId: number) => api.post(`/profiles/${profileId}/jobs/${jobId}/cancel-scheduled`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-jobs", profileId] }),
  });

  async function saveDraft() {
    setError("");
    setSaveNotice("");
    try {
      if (mode === "text") {
        await api.put(`/profiles/${profileId}/draft/text`, { messages: cleanMessages });
      } else if (savedIds.length) {
        await api.put(`/profiles/${profileId}/draft/saved`, { saved_message_ids: savedIds });
      }
      setSaveNotice("Draft saved.");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save draft.");
    }
  }

  function updateVariant(i: number, value: string) {
    setMessages((prev) => prev.map((m, idx) => (idx === i ? value : m)));
  }
  function addVariant() {
    setMessages((prev) => (prev.length < MAX_VARIANTS ? [...prev, ""] : prev));
  }
  function removeVariant(i: number) {
    setMessages((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function toggleSaved(id: number) {
    setSavedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (!activeProfile) {
    return (
      <div className="page page--narrow">
        <PageHead title="New broadcast" />
        <Card>
          <Empty icon="users" title="No Telegram profile yet" action={<Link to="/profiles" className="btn btn--primary">Add a profile</Link>}>
            Connect a Telegram account to start broadcasting.
          </Empty>
        </Card>
      </div>
    );
  }

  if (activeJob.data) {
    return (
      <div className="page page--narrow">
        <PageHead title="New broadcast" sub={activeProfile.label} />
        <Card>
          <Empty
            icon="progress"
            title={`Job #${activeJob.data.id} is still going (${activeJob.data.done}/${activeJob.data.total || "?"})`}
            action={
              <Button variant="primary" onClick={() => navigate("/progress")}>
                View progress
              </Button>
            }
          >
            A profile sends one broadcast at a time. Start the next one when this finishes, or cancel it from Progress.
          </Empty>
        </Card>
      </div>
    );
  }

  const selectedCount = selection.data?.length ?? 0;
  const hasContent = mode === "text" ? cleanMessages.length > 0 : savedIds.length > 0;
  const scheduleValid = !scheduleOn || (!!scheduledAt && new Date(scheduledAt).getTime() > Date.now());
  const canStart = !!activeProfile.has_session && hasContent && scheduleValid;

  // Estimate from the last finished run: its group count, and what each
  // group cost beyond that run's delay, applied to the delay chosen now.
  const last = latestJob.data;
  const lastUsable = last && last.status === "completed" && last.total > 0 && last.elapsed_seconds != null;
  const groups = lastUsable ? last.total : null;
  const overhead = lastUsable
    ? Math.min(Math.max(last.elapsed_seconds! / last.total - last.delay_seconds, 1), 60)
    : DEFAULT_OVERHEAD_SECONDS;
  const perGroup = delay + overhead;
  const estimate = groups ? groups * perGroup : null;
  const scheduled = scheduledJobs.data ?? [];

  return (
    <div className="page">
      <PageHead title="New broadcast" sub="Runs on the server as a background job. You can close the app once it starts." />

      <div className="grid grid--main">
        <div className="stack">
          <Tabs
            value={mode}
            onChange={setMode}
            options={[
              { value: "text", label: "Typed message" },
              { value: "saved", label: "Saved Message" },
            ]}
          />

          {mode === "text" ? (
            <>
              {messages.map((m, i) => (
                <Card key={i}>
                  <div className="spread" style={{ marginBottom: 10 }}>
                    <span className="eyebrow">{messages.length > 1 ? `Variant ${i + 1}` : "Message"}</span>
                    {messages.length > 1 && (
                      <button type="button" className="link link--danger" onClick={() => removeVariant(i)}>
                        Remove
                      </button>
                    )}
                  </div>
                  <Textarea value={m} onChange={(e) => updateVariant(i, e.target.value)} placeholder="Write the message every group should get…" maxLength={4096} />
                  <div className="hint mono" style={{ textAlign: "right", marginTop: 8 }}>
                    {m.length} / 4096
                  </div>
                </Card>
              ))}
              {messages.length < MAX_VARIANTS && (
                <Button icon="plus" onClick={addVariant} style={{ borderStyle: "dashed", background: "transparent" }}>
                  Add a message variant
                </Button>
              )}
              <p className="hint">
                {messages.length > 1 && "Variants rotate across groups in order, which helps identical text avoid being flagged. "}
                Supports <code>**bold**</code>, <code>__italic__</code>, <code>`code`</code> and <code>[text](url)</code>. Formatting
                pasted from Telegram won't survive: retype it with this syntax, or use a Saved Message.
              </p>
            </>
          ) : (
            <>
              <p className="hint">
                Write it in Telegram's Saved Messages with full formatting and media, react to it with any emoji to tag it, then
                pick it here. Pick more than one to rotate between them.
              </p>
              {staleNotice && <Alert tone="warn">{staleNotice}</Alert>}
              {savedMessages.error && (
                <Alert tone="bad">
                  {savedMessages.error instanceof ApiError ? savedMessages.error.message : "Could not load saved messages."}
                </Alert>
              )}
              <Button icon="refresh" onClick={() => savedMessages.refetch()} loading={savedMessages.isFetching}>
                {savedMessages.isFetching ? "Loading…" : savedMessages.data ? "Refresh tagged messages" : "Load tagged Saved Messages"}
              </Button>
              {savedMessages.data && savedMessages.data.length === 0 && (
                <Card>
                  <Empty icon="message" title="No tagged messages found">
                    React to a message in your Saved Messages with any emoji, then refresh.
                  </Empty>
                </Card>
              )}
              {(savedMessages.data ?? []).map((m) => {
                const idx = savedIds.indexOf(m.id);
                return (
                  <button type="button" className="pick" key={m.id} aria-pressed={idx !== -1} onClick={() => toggleSaved(m.id)}>
                    <span className="pick-tag">{m.tag}</span>
                    <span className="grow" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                      {m.preview}
                    </span>
                    <span className="pick-check">{idx !== -1 ? idx + 1 : ""}</span>
                  </button>
                );
              })}
              <Alert tone="warn">Without Telegram Premium on this profile, every group shows a "Forwarded from" label.</Alert>
            </>
          )}
        </div>

        <div className="stack sticky-col">
          <Card>
            <CardHead title="Delivery" />
            <div className="stack">
              <Slider label="Delay between sends" value={delay} min={0} max={60} step={1} format={(v) => `${v}s`} onChange={setDelay} />
              <Slider label="Longest slowmode wait" value={maxSlow} min={30} max={1800} step={30} format={(v) => fmtDuration(v)} onChange={setMaxSlow} />
              <hr className="divider" />
              <div className="setting">
                <div>
                  <div className="setting-title">Also post to Discord</div>
                  <div className="setting-sub">
                    {selectedCount} channel{selectedCount === 1 ? "" : "s"} selected in Targets
                  </div>
                </div>
                <Switch on={includeDiscord} onChange={setIncludeDiscord} label="Also post to Discord" />
              </div>
              <div className="setting">
                <div>
                  <div className="setting-title">Schedule for later</div>
                  <div className="setting-sub">Starts by itself at the time you pick</div>
                </div>
                <Switch on={scheduleOn} onChange={setScheduleOn} label="Schedule for later" />
              </div>
              {scheduleOn && (
                <input type="datetime-local" className="input" value={scheduledAt} min={toLocalInputValue(new Date())} onChange={(e) => setScheduledAt(e.target.value)} />
              )}
            </div>
          </Card>

          <div className="card card--hero">
            <div className="eyebrow eyebrow--accent" style={{ marginBottom: 14 }}>
              Broadcast summary
            </div>
            <div className="summary">
              <div>
                <b>{groups ?? "—"}</b>
                <span>Groups{groups ? " last run" : ""}</span>
              </div>
              <div>
                <b>{includeDiscord ? selectedCount : 0}</b>
                <span>Discord</span>
              </div>
              <div>
                <b>{estimate ? `~${fmtDuration(estimate)}` : `${perGroup.toFixed(0)}s`}</b>
                <span>{estimate ? "Est. time" : "Per group"}</span>
              </div>
            </div>
            <div className="eta-note">
              {estimate
                ? `Based on your last broadcast: ${groups} groups at about ${perGroup.toFixed(1)}s each with this delay. The live estimate takes over once it starts.`
                : "Roughly this long per group. You'll get a live estimate as soon as the broadcast starts."}
            </div>
            {!activeProfile.has_session && (
              <div style={{ marginTop: 12 }}>
                <Alert tone="bad">
                  This profile has no Telegram session. <Link to="/profiles" className="link">Reconnect it</Link> first.
                </Alert>
              </div>
            )}
            {error && (
              <div style={{ marginTop: 12 }}>
                <Alert tone="bad">{error}</Alert>
              </div>
            )}
            {saveNotice && (
              <div style={{ marginTop: 12 }}>
                <Alert tone="ok">{saveNotice}</Alert>
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 16, flexWrap: "nowrap" }}>
              <Button size="lg" onClick={saveDraft}>
                Save draft
              </Button>
              <Button variant="primary" size="lg" className="grow" icon={scheduleOn ? "calendar" : "send"} disabled={!canStart} loading={start.isPending} onClick={() => { setError(""); start.mutate(); }}>
                {start.isPending ? "Starting…" : scheduleOn ? "Schedule" : "Broadcast now"}
              </Button>
            </div>
          </div>

          {scheduled.length > 0 && (
            <Card flush>
              <CardHead pad title="Scheduled" sub={`${scheduled.length} waiting to start`} />
              <div className="rows" style={{ maxHeight: 260, overflowY: "auto" }}>
                {scheduled.map((j) => (
                  <div className="row row--tight" key={j.id}>
                    <Icon name="calendar" size={17} className="faint" />
                    <div className="row-main">
                      <div className="row-title">{fmtDateTime(parseServerTime(j.scheduled_at))}</div>
                      <div className="row-sub">Job #{j.id} · {j.delay_seconds}s delay</div>
                    </div>
                    <button type="button" className="link link--danger" disabled={cancelScheduled.isPending} onClick={() => cancelScheduled.mutate(j.id)}>
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
