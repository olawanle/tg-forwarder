import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { Textarea } from "../components/Field";
import { SegmentedTabs, ToggleSwitch } from "../components/Small";
import { Slider } from "../components/Slider";
import { useProfiles } from "../profile/ProfileContext";
import { api, ApiError } from "../api/client";
import type { Job, SavedMessage } from "../api/types";

type Mode = "text" | "saved";
const MAX_VARIANTS = 5;

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

  const activeJob = useQuery({
    queryKey: ["active-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/active`),
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
        setSaveNotice(`Scheduled for ${new Date(job.scheduled_at!).toLocaleString()}.`);
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
      <div className="page">
        <h1 className="page-title">Compose</h1>
        <GlassCard>Add a Telegram profile first.</GlassCard>
      </div>
    );
  }

  if (activeJob.data) {
    return (
      <div className="page">
        <h1 className="page-title">Compose</h1>
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Job #{activeJob.data.id} is {activeJob.data.status} ({activeJob.data.done}/
              {activeJob.data.total || "?"}).
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>
              Start is disabled until it finishes or you cancel it.
            </div>
            <Button variant="secondary" onClick={() => navigate("/progress")}>
              View progress
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  const selectedCount = selection.data?.length ?? 0;
  const hasContent = mode === "text" ? cleanMessages.length > 0 : savedIds.length > 0;
  const scheduleValid = !scheduleOn || (!!scheduledAt && new Date(scheduledAt).getTime() > Date.now());
  const canStart = !!activeProfile.has_session && hasContent && scheduleValid;

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Compose</h1>
        <div className="page-subtitle">Runs as a background job — you can close the app.</div>
      </div>

      {(scheduledJobs.data ?? []).length > 0 && (
        <GlassCard soft>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Upcoming
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(scheduledJobs.data ?? []).map((j) => (
              <div key={j.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {j.scheduled_at ? new Date(j.scheduled_at).toLocaleString() : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => cancelScheduled.mutate(j.id)}
                  disabled={cancelScheduled.isPending}
                  style={{ background: "none", border: "none", color: "var(--bad)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <SegmentedTabs
        value={mode}
        onChange={setMode}
        options={[
          { value: "text", label: "Typed" },
          { value: "saved", label: "Saved Message" },
        ]}
      />

      {mode === "text" ? (
        <>
          {messages.map((m, i) => (
            <GlassCard key={i}>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {messages.length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Variant {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      style={{ background: "none", border: "none", color: "var(--bad)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <Textarea value={m} onChange={(e) => updateVariant(i, e.target.value)} placeholder="Your marketing message…" />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>{m.length} / 4096</span>
                </div>
              </div>
            </GlassCard>
          ))}
          {messages.length < MAX_VARIANTS && (
            <Button variant="outline" small onClick={addVariant}>
              + Add message variant
            </Button>
          )}
          <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5, padding: "0 4px" }}>
            {messages.length > 1
              ? "Rotates across targets in order — helps avoid identical repeated text getting flagged. "
              : ""}
            Supports <code>**bold**</code>, <code>__italic__</code>, <code>`code`</code>, <code>[text](url)</code>.
            Formatting copied from a Telegram message won't survive — retype it with this syntax, or switch to Saved
            Message mode.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text2)", lineHeight: 1.5, padding: "0 4px" }}>
            Write it in Telegram's Saved Messages with full formatting, react with any emoji to tag it, then pick it
            here. Select more than one to rotate between them across a broadcast.
          </div>
          <Button
            variant="outline"
            onClick={() => savedMessages.refetch()}
            disabled={savedMessages.isFetching}
          >
            {savedMessages.isFetching ? "Loading…" : "Refresh tagged Saved Messages"}
          </Button>
          {(savedMessages.data ?? []).map((m) => {
            const idx = savedIds.indexOf(m.id);
            const selected = idx !== -1;
            return (
              <GlassCard key={m.id} onClick={() => toggleSaved(m.id)}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 22, lineHeight: 1 }}>{m.tag}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{m.preview}</div>
                  </div>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: selected ? "var(--accent-grad)" : "transparent",
                      boxShadow: "inset 0 0 0 2px var(--hair)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 800,
                      color: "#fff",
                    }}
                  >
                    {selected ? idx + 1 : ""}
                  </span>
                </div>
              </GlassCard>
            );
          })}
          <div
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              background: "var(--warn-soft)",
              borderRadius: 18,
              padding: "12px 14px",
            }}
          >
            <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text2)" }}>
              Without Telegram Premium on this profile, every group shows a "Forwarded from" label.
            </span>
          </div>
        </>
      )}

      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Slider label="Delay between sends" value={delay} min={3} max={60} step={1} suffix="s" onChange={setDelay} />
          <Slider
            label="Max slowmode wait"
            value={maxSlow}
            min={30}
            max={1800}
            step={30}
            suffix="s"
            onChange={setMaxSlow}
          />
          <div style={{ height: 1, background: "var(--hair)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, paddingRight: 14 }}>
              Also post to {selectedCount} Discord channel{selectedCount === 1 ? "" : "s"}
            </span>
            <ToggleSwitch on={includeDiscord} onChange={setIncludeDiscord} />
          </div>
          <div style={{ height: 1, background: "var(--hair)" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, paddingRight: 14 }}>Schedule for later</span>
            <ToggleSwitch on={scheduleOn} onChange={setScheduleOn} />
          </div>
          {scheduleOn && (
            <input
              type="datetime-local"
              className="field"
              value={scheduledAt}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          )}
        </div>
      </GlassCard>

      {error && <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
      {saveNotice && <div style={{ color: "var(--ok)", fontSize: 13, fontWeight: 600 }}>{saveNotice}</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <Button variant="outline" style={{ flex: "0 0 108px" }} onClick={saveDraft}>
          Save draft
        </Button>
        <Button
          variant="secondary"
          disabled={!canStart || start.isPending}
          onClick={() => start.mutate()}
        >
          {start.isPending ? "Starting…" : scheduleOn ? "Schedule broadcast" : "Broadcast now"}
        </Button>
      </div>
    </div>
  );
}
