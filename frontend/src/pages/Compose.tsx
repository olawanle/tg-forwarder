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

export function Compose() {
  const { activeProfile } = useProfiles();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [mode, setMode] = useState<Mode>("text");
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [delay, setDelay] = useState(3);
  const [maxSlow, setMaxSlow] = useState(300);
  const [includeDiscord, setIncludeDiscord] = useState(false);
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");

  const profileId = activeProfile?.id;

  useEffect(() => {
    if (!activeProfile) return;
    setMode(activeProfile.draft_mode === "saved" ? "saved" : "text");
    setMessage(activeProfile.draft_message || "");
    setSavedId(activeProfile.draft_saved_message_id);
  }, [activeProfile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeJob = useQuery({
    queryKey: ["active-job", profileId],
    queryFn: () => api.get<Job | null>(`/profiles/${profileId}/jobs/active`),
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

  const start = useMutation({
    mutationFn: () =>
      api.post<Job>(`/profiles/${profileId}/broadcast/start`, {
        mode,
        message: mode === "text" ? message : "",
        source_message_id: mode === "saved" ? savedId : null,
        delay_seconds: delay,
        max_slowmode_wait: maxSlow,
        include_discord: includeDiscord,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-job", profileId] });
      navigate("/progress");
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start broadcast."),
  });

  async function saveDraft() {
    setError("");
    setSaveNotice("");
    try {
      if (mode === "text") {
        await api.put(`/profiles/${profileId}/draft/text`, { message });
      } else if (savedId) {
        await api.put(`/profiles/${profileId}/draft/saved`, { saved_message_id: savedId });
      }
      setSaveNotice("Draft saved.");
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save draft.");
    }
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
  const canStart =
    !!activeProfile.has_session && (mode === "text" ? message.trim().length > 0 : !!savedId);

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Compose</h1>
        <div className="page-subtitle">Runs as a background job — you can close the app.</div>
      </div>

      <SegmentedTabs
        value={mode}
        onChange={setMode}
        options={[
          { value: "text", label: "Typed" },
          { value: "saved", label: "Saved Message" },
        ]}
      />

      {mode === "text" ? (
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Your marketing message…"
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>
                {message.length} / 4096
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>
              Supports <code>**bold**</code>, <code>__italic__</code>, <code>`code`</code>,{" "}
              <code>[text](url)</code>. Formatting copied from a Telegram message won't survive —
              retype it with this syntax, or switch to Saved Message mode.
            </div>
          </div>
        </GlassCard>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text2)", lineHeight: 1.5, padding: "0 4px" }}>
            Write it in Telegram's Saved Messages with full formatting, react with any emoji to
            tag it, then pick it here — formatting, media and custom emoji survive exactly.
          </div>
          <Button
            variant="outline"
            onClick={() => savedMessages.refetch()}
            disabled={savedMessages.isFetching}
          >
            {savedMessages.isFetching ? "Loading…" : "Refresh tagged Saved Messages"}
          </Button>
          {(savedMessages.data ?? []).map((m) => (
            <GlassCard key={m.id} onClick={() => setSavedId(m.id)}>
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
                    background: savedId === m.id ? "var(--accent-grad)" : "transparent",
                    boxShadow: "inset 0 0 0 2px var(--hair)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {savedId === m.id && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </div>
            </GlassCard>
          ))}
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
              Without Telegram Premium on this profile, every group shows a "Forwarded from"
              label.
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
          {start.isPending ? "Starting…" : "Broadcast now"}
        </Button>
      </div>
    </div>
  );
}
