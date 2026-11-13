import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import type { ProfilePlan } from "../api/types";
import { useProfiles } from "../profile/ProfileContext";
import { fmtDuration } from "../lib/time";
import { Alert, Avatar, Button, Pill, Sheet, SkeletonRows } from "./ui";

function settingsLine(p: ProfilePlan): string {
  const parts = [
    p.mode === "saved" ? `${p.variants} Saved Message${p.variants === 1 ? "" : "s"}` : p.variants > 1 ? `${p.variants} variants` : "1 message",
    `${p.delay_seconds}s delay`,
    `slowmode up to ${fmtDuration(p.max_slowmode_wait)}`,
  ];
  if (p.include_discord) parts.push("+ Discord");
  return parts.join(" · ");
}

function BroadcastAllSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setActiveProfileId } = useProfiles();
  const [error, setError] = useState("");

  const plan = useQuery({
    queryKey: ["broadcast-all-plan"],
    queryFn: () => api.get<ProfilePlan[]>("/broadcast/all/plan"),
    staleTime: 0,
  });

  const start = useMutation({
    mutationFn: () => api.post<ProfilePlan[]>("/broadcast/all/start"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-job"] });
      qc.invalidateQueries({ queryKey: ["latest-job"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not start the broadcasts."),
  });

  const rows = start.data ?? plan.data ?? [];
  const ready = (plan.data ?? []).filter((p) => p.ready).length;
  const startedCount = (start.data ?? []).filter((p) => p.started).length;

  function view(profileId: number) {
    setActiveProfileId(profileId);
    onClose();
    navigate("/progress");
  }

  return (
    <Sheet onClose={onClose} wide>
      <div>
        <div className="sheet-title">{start.data ? `Started ${startedCount} broadcast${startedCount === 1 ? "" : "s"}` : "Broadcast all profiles"}</div>
        <div className="sheet-sub">
          {start.data
            ? "They run on the server side by side. Open any of them to follow it live."
            : "Each profile sends its own saved draft with the settings from its last broadcast."}
        </div>
      </div>

      {plan.isLoading ? (
        <SkeletonRows count={3} />
      ) : plan.error ? (
        <Alert tone="bad">{plan.error instanceof ApiError ? plan.error.message : "Could not load your profiles."}</Alert>
      ) : (
        <div className="card card--flush">
          <div className="rows" style={{ maxHeight: "46dvh", overflowY: "auto" }}>
            {rows.map((p) => {
              const ok = start.data ? p.started : p.ready;
              return (
                <div className="row" key={p.profile_id} style={{ alignItems: "flex-start", opacity: ok ? 1 : 0.62 }}>
                  <Avatar name={p.label} size={34} />
                  <div className="row-main">
                    <div className="row-title">{p.label}</div>
                    {ok ? (
                      <>
                        <div className="row-sub">{settingsLine(p)}</div>
                        {p.preview && (
                          <div className="row-sub" style={{ color: "var(--text-2)" }}>
                            “{p.preview}”
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="row-sub">{p.reason}</div>
                    )}
                  </div>
                  <div className="row-end">
                    {start.data ? (
                      p.started ? (
                        <Button size="sm" onClick={() => view(p.profile_id)}>
                          View
                        </Button>
                      ) : (
                        <Pill>Skipped</Pill>
                      )
                    ) : p.ready ? (
                      <Pill tone="accent">{p.from_last_broadcast ? "Ready" : "Defaults"}</Pill>
                    ) : (
                      <Pill>Skip</Pill>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plan.data && !start.data && plan.data.some((p) => p.ready && !p.from_last_broadcast) && (
        <div className="hint">“Defaults” means the profile has never broadcast, so it uses your default delay, a 5 minute slowmode limit and no Discord.</div>
      )}
      {error && <Alert tone="bad">{error}</Alert>}

      {start.data ? (
        <Button variant="primary" size="lg" block onClick={onClose}>
          Done
        </Button>
      ) : (
        <div className="btn-row" style={{ flexWrap: "nowrap" }}>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" className="grow" icon="send" disabled={!ready} loading={start.isPending} onClick={() => { setError(""); start.mutate(); }}>
            {start.isPending ? "Starting…" : ready ? `Start ${ready} broadcast${ready === 1 ? "" : "s"}` : "Nothing to start"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Opens the "broadcast all profiles" sheet. Hidden for single-profile accounts. */
export function BroadcastAllButton({ className, block = false }: { className?: string; block?: boolean }) {
  const { profiles } = useProfiles();
  const [open, setOpen] = useState(false);
  if (profiles.length < 2) return null;
  return (
    <>
      <Button icon="zap" className={className} block={block} onClick={() => setOpen(true)}>
        Broadcast all profiles
      </Button>
      {open && <BroadcastAllSheet onClose={() => setOpen(false)} />}
    </>
  );
}
