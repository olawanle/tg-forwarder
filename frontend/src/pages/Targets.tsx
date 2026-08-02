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
    <div className="page">
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

function BlacklistTab({ profileId }: { profileId: number }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skips", profileId] }),
  });

  async function leaveAll() {
    setBusy(true);
    setNotice("");
    try {
      const res = await api.post<{ left: { target_id: string; name: string }[]; failed: { target_id: string; name: string; detail: string }[] }>(
        `/profiles/${profileId}/leave-groups`,
        {},
      );
      setNotice(`Left ${res.left.length} group(s)${res.failed.length ? `, ${res.failed.length} failed` : ""}.`);
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not leave groups.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveOne(targetId: string) {
    setBusy(true);
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
    } finally {
      setBusy(false);
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

      <Button variant="danger" onClick={leaveAll} disabled={busy}>
        Leave all {skips.length} blacklisted group(s)
      </Button>
      {notice && <div style={{ fontSize: 12.5, color: "var(--text2)", padding: "0 4px" }}>{notice}</div>}

      {skips.map((s) => (
        <GlassCard key={s.target_id}>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <AvatarBadge seed={s.name} size={40} fontSize={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{s.at}</div>
              </div>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "var(--warn-soft)",
                  color: "var(--warn)",
                }}
              >
                {s.reason}
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
              <Button variant="outline" small onClick={() => restore.mutate(s.target_id)} disabled={busy}>
                Restore
              </Button>
              <Button variant="danger" small onClick={() => leaveOne(s.target_id)} disabled={busy}>
                Leave group
              </Button>
            </div>
          </div>
        </GlassCard>
      ))}

      <Button variant="outline" onClick={() => clearAll.mutate()} disabled={busy}>
        Clear entire blacklist (keeps you in the groups)
      </Button>
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
    </>
  );
}
