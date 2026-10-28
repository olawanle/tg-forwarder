import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { Button } from "../components/Button";
import { Input } from "../components/Field";
import { SegmentedTabs, ToggleSwitch, AvatarBadge } from "../components/Small";
import { useProfiles } from "../profile/ProfileContext";
import { api, ApiError } from "../api/client";
import type { DiscordChannel, Group, Skip } from "../api/types";

type Tab = "groups" | "blacklist" | "discord";

export function Targets() {
  const { activeProfile } = useProfiles();
  const [tab, setTab] = useState<Tab>("groups");

  if (!activeProfile) {
    return (
      <div className="page">
        <h1 className="page-title">Targets</h1>
        <GlassCard>Add a Telegram profile first.</GlassCard>
      </div>
    );
  }

  return (
    <div className="page page--wide">
      <div>
        <h1 className="page-title">Targets</h1>
        <div className="page-subtitle">
          Every group on this profile gets the broadcast. Blacklisted ones are skipped.
        </div>
      </div>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "groups", label: "Groups" },
          { value: "blacklist", label: "Blacklist" },
          { value: "discord", label: "Discord" },
        ]}
      />

      {tab === "groups" && <GroupsTab profileId={activeProfile.id} />}
      {tab === "blacklist" && <BlacklistTab profileId={activeProfile.id} />}
      {tab === "discord" && <DiscordTab profileId={activeProfile.id} />}
    </div>
  );
}

function GroupsTab({ profileId }: { profileId: number }) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["groups", profileId],
    queryFn: () => api.get<Group[]>(`/profiles/${profileId}/groups`),
    enabled: false,
  });

  const groups = query.data ?? [];
  const filtered = useMemo(
    () => groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase())),
    [groups, search],
  );

  async function preview() {
    setError("");
    try {
      await query.refetch({ throwOnError: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load groups.");
    }
  }

  return (
    <>
      {query.data === undefined ? (
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "8px 0" }}>
            {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
            <Button onClick={preview} disabled={query.isFetching}>
              {query.isFetching ? "Loading…" : "Preview all Telegram groups"}
            </Button>
          </div>
        </GlassCard>
      ) : (
        <>
          <Input placeholder="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text2)" }}>
              {groups.length} group(s) included
            </span>
            <button
              type="button"
              onClick={preview}
              style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
            >
              {query.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div className="card-grid">
            {filtered.map((g) => (
              <GlassCard key={g.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <AvatarBadge seed={g.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                      {g.kind}
                      {g.stars_required > 0 ? ` · ${g.stars_required} stars` : ""}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const SKIP_REASON_LABELS: Record<string, string> = {
  auto_deleted: "wiped",
  stars_required: "stars",
  skipped_stars: "stars",
  skipped_slowmode: "slowmode",
};

function reasonLabel(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

// s.at is Python's str(datetime) ("2026-10-25 09:27:08.101895+00:00"), not
// ISO -- trim straight to "YYYY-MM-DD HH:MM" instead of showing microseconds
// and a UTC offset, which wraps awkwardly in the card's narrow timestamp line.
function formatSkipAt(at: string): string {
  return at.slice(0, 16);
}

function BlacklistTab({ profileId }: { profileId: number }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | "all" | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["skips", profileId],
    queryFn: () => api.get<Skip[]>(`/profiles/${profileId}/skips`),
  });
  const skips = data ?? [];

  const restore = useMutation({
    mutationFn: (targetId: string) =>
      api.post(`/profiles/${profileId}/skips/${encodeURIComponent(targetId)}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skips", profileId] }),
  });

  const clearAll = useMutation({
    mutationFn: () => api.del(`/profiles/${profileId}/skips`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
      setConfirmClear(false);
    },
  });

  async function leaveAll() {
    setBusyId("all");
    setNotice("");
    try {
      const res = await api.post<{ left: { target_id: string; name: string }[]; failed: { target_id: string; name: string; detail: string }[] }>(
        `/profiles/${profileId}/leave-groups`,
        {},
      );
      let msg = `Left ${res.left.length} group(s).`;
      if (res.failed.length > 0) {
        msg += ` Failed: ${res.failed.map((f) => `${f.name} (${f.detail})`).join(", ")}`;
      }
      setNotice(msg);
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not leave groups.");
    } finally {
      setBusyId(null);
    }
  }

  async function leaveOne(targetId: string) {
    setBusyId(targetId);
    setNotice("");
    try {
      const res = await api.post<{ left: unknown[]; failed: { detail: string }[] }>(
        `/profiles/${profileId}/leave-groups`,
        { target_ids: [targetId] },
      );
      if (res.failed.length > 0) {
        setNotice(`Failed to leave: ${res.failed[0].detail}`);
      }
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not leave this group.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <GlassCard>Loading…</GlassCard>;
  if (skips.length === 0) return <GlassCard>No blacklisted groups yet.</GlassCard>;

  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--text2)", lineHeight: 1.5, padding: "0 4px" }}>
        Auto-blacklisted after a wiped post or a Stars paywall. Leaving removes the account from
        the group entirely — you'd need to be re-invited to rejoin.
      </div>

      <Button variant="danger" onClick={leaveAll} disabled={busyId !== null}>
        {busyId === "all" ? "Leaving…" : `Leave all ${skips.length} blacklisted group(s)`}
      </Button>
      {notice && <div style={{ fontSize: 12.5, color: "var(--text2)", padding: "0 4px", lineHeight: 1.5 }}>{notice}</div>}

      <div className="card-grid">
        {skips.map((s) => (
          <GlassCard key={s.target_id}>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <AvatarBadge seed={s.name} size={40} fontSize={14} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{formatSkipAt(s.at)}</div>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: "5px 10px",
                    borderRadius: 999,
                    background: "var(--warn-soft)",
                    color: "var(--warn)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {reasonLabel(s.reason)}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--text2)",
                  background: "var(--field)",
                  boxShadow: "var(--field-in)",
                  borderRadius: 13,
                  padding: "9px 12px",
                }}
              >
                {s.detail}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" small onClick={() => restore.mutate(s.target_id)} disabled={busyId !== null}>
                  Restore
                </Button>
                <Button variant="danger" small onClick={() => leaveOne(s.target_id)} disabled={busyId !== null}>
                  {busyId === s.target_id ? "Leaving…" : "Leave group"}
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {confirmClear ? (
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>
              Clear the entire blacklist? Every group above becomes eligible for broadcasts again
              — you stay a member of all of them, nothing is left.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" small onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button variant="danger" small onClick={() => clearAll.mutate()} disabled={clearAll.isPending}>
                {clearAll.isPending ? "Clearing…" : "Yes, clear it"}
              </Button>
            </div>
          </div>
        </GlassCard>
      ) : (
        <Button variant="outline" onClick={() => setConfirmClear(true)} disabled={busyId !== null}>
          Clear entire blacklist (keeps you in the groups)
        </Button>
      )}
    </>
  );
}

function DiscordTab({ profileId }: { profileId: number }) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const channelsQuery = useQuery({
    queryKey: ["discord-channels", profileId],
    queryFn: () => api.get<DiscordChannel[]>(`/profiles/${profileId}/discord-channels`),
    enabled: false,
  });
  const selectionQuery = useQuery({
    queryKey: ["discord-selection", profileId],
    queryFn: () => api.get<string[]>(`/profiles/${profileId}/discord-selection`),
  });

  const save = useMutation({
    mutationFn: (ids: string[]) => api.put(`/profiles/${profileId}/discord-selection`, { channel_ids: ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discord-selection", profileId] }),
  });

  const channels = channelsQuery.data ?? [];
  const selected = new Set(selectionQuery.data ?? []);

  async function refresh() {
    setError("");
    try {
      await channelsQuery.refetch({ throwOnError: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load Discord channels.");
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save.mutate(Array.from(next));
  }

  return (
    <>
      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: "4px 0" }}>
          {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
          <Button onClick={refresh} disabled={channelsQuery.isFetching}>
            {channelsQuery.isFetching ? "Loading…" : "Refresh Discord channels"}
          </Button>
        </div>
      </GlassCard>
      <div className="card-grid">
        {channels.map((c) => (
          <GlassCard key={c.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: "var(--field)",
                  boxShadow: "var(--field-in)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 16,
                  fontWeight: 800,
                  color: "var(--text3)",
                  flexShrink: 0,
                }}
              >
                #
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>{c.guild}</div>
              </div>
              <ToggleSwitch on={selected.has(c.id)} onChange={() => toggle(c.id)} />
            </div>
          </GlassCard>
        ))}
      </div>
    </>
  );
}
