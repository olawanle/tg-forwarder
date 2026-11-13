import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../components/Icon";
import { Alert, Avatar, Button, Card, Empty, Input, PageHead, Pill, SkeletonRows, Switch, Tabs, resultLabel } from "../components/ui";
import { useProfiles } from "../profile/ProfileContext";
import { api, ApiError } from "../api/client";
import type { DiscordChannel, Group, Skip } from "../api/types";
import { fmtAgo, parseServerTime } from "../lib/time";

type Tab = "groups" | "blacklist" | "discord";
/** Rows rendered at once. Accounts can be in thousands of groups; a phone
 * should not have to lay them all out to show the first screen. */
const PAGE = 150;

export function Targets() {
  const { activeProfile } = useProfiles();
  const [tab, setTab] = useState<Tab>("groups");
  const profileId = activeProfile?.id;

  const skips = useQuery({
    queryKey: ["skips", profileId],
    queryFn: () => api.get<Skip[]>(`/profiles/${profileId}/skips`),
    enabled: !!profileId,
  });

  if (!activeProfile) {
    return (
      <div className="page page--narrow">
        <PageHead title="Targets" />
        <Card>
          <Empty icon="users" title="No Telegram profile yet" action={<Link to="/profiles" className="btn btn--primary">Add a profile</Link>}>
            Connect a Telegram account to see its groups.
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title="Targets" sub="Every group this profile is in gets the broadcast. Blacklisted ones are skipped." />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "groups", label: "Groups" },
          { value: "blacklist", label: "Blacklist", count: skips.data?.length },
          { value: "discord", label: "Discord" },
        ]}
      />
      {tab === "groups" && <GroupsTab profileId={activeProfile.id} />}
      {tab === "blacklist" && <BlacklistTab profileId={activeProfile.id} skips={skips.data ?? []} isLoading={skips.isLoading} />}
      {tab === "discord" && <DiscordTab profileId={activeProfile.id} />}
    </div>
  );
}

function GroupsTab({ profileId }: { profileId: number }) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [shown, setShown] = useState(PAGE);
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

  async function load() {
    setError("");
    try {
      await query.refetch({ throwOnError: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load groups.");
    }
  }

  if (query.data === undefined) {
    return (
      <Card>
        <Empty
          icon="target"
          title="See who will receive your broadcast"
          action={
            <Button variant="primary" icon="refresh" onClick={load} loading={query.isFetching}>
              {query.isFetching ? "Loading from Telegram…" : "Load groups"}
            </Button>
          }
        >
          This asks Telegram for every group the account is in. It can take a few seconds on large accounts.
        </Empty>
        {error && <Alert tone="bad">{error}</Alert>}
      </Card>
    );
  }

  return (
    <>
      <div className="cluster" style={{ flexWrap: "nowrap" }}>
        <div className="search grow">
          <Icon name="search" size={16} />
          <Input placeholder="Search groups" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} />
        </div>
        <Button icon="refresh" onClick={load} loading={query.isFetching} aria-label="Refresh">
          <span className="only-desktop">Refresh</span>
        </Button>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      <Card flush>
        <div className="spread" style={{ padding: "14px 20px" }}>
          <span className="card-title">
            <span className="num">{groups.length.toLocaleString()}</span> groups included
          </span>
          {search && <span className="faint" style={{ fontSize: 12.5 }}>{filtered.length} match</span>}
        </div>
        {filtered.length === 0 ? (
          <Empty icon="search" title="No group matches that search" />
        ) : (
          <div className="rows">
            {filtered.slice(0, shown).map((g) => (
              <div className="row row--tight" key={g.id} style={{ borderTop: "1px solid var(--line)" }}>
                <Avatar name={g.name} size={34} />
                <div className="row-main">
                  <div className="row-title">{g.name}</div>
                  <div className="row-sub" style={{ textTransform: "capitalize" }}>{g.kind}</div>
                </div>
                {g.stars_required > 0 && (
                  <Pill tone="warn">
                    <Icon name="star" size={11} />
                    {g.stars_required} Stars
                  </Pill>
                )}
              </div>
            ))}
          </div>
        )}
        {filtered.length > shown && (
          <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
            <Button block onClick={() => setShown((n) => n + PAGE * 2)}>
              Show more ({(filtered.length - shown).toLocaleString()} left)
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

function BlacklistTab({ profileId, skips, isLoading }: { profileId: number; skips: Skip[]; isLoading: boolean }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | "all" | null>(null);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"clear" | "leave" | null>(null);

  const restore = useMutation({
    mutationFn: (targetId: string) => api.post(`/profiles/${profileId}/skips/${encodeURIComponent(targetId)}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skips", profileId] }),
  });

  const clearAll = useMutation({
    mutationFn: () => api.del(`/profiles/${profileId}/skips`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
      setConfirm(null);
    },
  });

  async function leaveAll() {
    setBusyId("all");
    setNotice("");
    setConfirm(null);
    try {
      const res = await api.post<{ left: { target_id: string; name: string }[]; failed: { target_id: string; name: string; detail: string }[] }>(
        `/profiles/${profileId}/leave-groups`,
        {},
      );
      let msg = `Left ${res.left.length} group(s).`;
      if (res.failed.length > 0) msg += ` Failed: ${res.failed.map((f) => `${f.name} (${f.detail})`).join(", ")}`;
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
      const res = await api.post<{ left: unknown[]; failed: { detail: string }[] }>(`/profiles/${profileId}/leave-groups`, {
        target_ids: [targetId],
      });
      if (res.failed.length > 0) setNotice(`Failed to leave: ${res.failed[0].detail}`);
      qc.invalidateQueries({ queryKey: ["skips", profileId] });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not leave this group.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return (
      <Card flush>
        <SkeletonRows count={4} />
      </Card>
    );
  }
  if (skips.length === 0) {
    return (
      <Card>
        <Empty icon="check" title="Nothing blacklisted">
          Groups land here automatically when they wipe a post, charge Stars, or block the account. They are then skipped.
        </Empty>
        {notice && <Alert>{notice}</Alert>}
      </Card>
    );
  }

  return (
    <>
      <p className="hint">
        Added automatically after a wiped post, a Stars paywall or a ban, and skipped from then on. <b>Restore</b> puts a group
        back in the broadcast. <b>Leave</b> removes the account from the group for good: you would need a new invite to rejoin.
      </p>
      {notice && <Alert>{notice}</Alert>}

      <div className="grid grid--cards">
        {skips.map((s) => (
          <Card key={s.target_id}>
            <div className="cluster" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Avatar name={s.name} size={38} />
              <div className="grow">
                <div className="row-title">{s.name}</div>
                <div className="row-sub">{fmtAgo(parseServerTime(s.at))}</div>
              </div>
              <Pill tone="warn">{resultLabel(s.reason)}</Pill>
            </div>
            {s.detail && (
              <div className="hint" style={{ marginTop: 12 }}>
                {s.detail}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 14 }}>
              <Button size="sm" icon="undo" className="grow" onClick={() => restore.mutate(s.target_id)} disabled={busyId !== null}>
                Restore
              </Button>
              <Button size="sm" variant="danger" icon="logout" className="grow" onClick={() => leaveOne(s.target_id)} loading={busyId === s.target_id} disabled={busyId !== null}>
                {busyId === s.target_id ? "Leaving…" : "Leave group"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        {confirm === null ? (
          <div className="btn-row">
            <Button className="grow" onClick={() => setConfirm("clear")} disabled={busyId !== null}>
              Clear the blacklist
            </Button>
            <Button variant="danger" className="grow" onClick={() => setConfirm("leave")} loading={busyId === "all"} disabled={busyId !== null}>
              {busyId === "all" ? "Leaving…" : `Leave all ${skips.length}`}
            </Button>
          </div>
        ) : (
          <div className="stack stack--sm">
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {confirm === "clear"
                ? "Clear the whole blacklist? Every group above becomes eligible for broadcasts again. You stay a member of all of them."
                : `Leave all ${skips.length} blacklisted groups? The account is removed from each one and would need a new invite to rejoin.`}
            </div>
            <div className="btn-row">
              <Button className="grow" onClick={() => setConfirm(null)}>
                Keep as is
              </Button>
              {confirm === "clear" ? (
                <Button variant="danger" className="grow" onClick={() => clearAll.mutate()} loading={clearAll.isPending}>
                  Yes, clear it
                </Button>
              ) : (
                <Button variant="danger" className="grow" onClick={leaveAll}>
                  Yes, leave them all
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
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
      <div className="spread">
        <span className="muted" style={{ fontSize: 13.5 }}>
          <span className="num">{selected.size}</span> channel{selected.size === 1 ? "" : "s"} selected
        </span>
        <Button icon="refresh" onClick={refresh} loading={channelsQuery.isFetching}>
          {channelsQuery.isFetching ? "Loading…" : channelsQuery.data ? "Refresh" : "Load channels"}
        </Button>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      <Card flush>
        {channelsQuery.data === undefined ? (
          <Empty icon="hash" title="Pick the Discord channels to post to">
            Load the channels the bot can see, then switch on the ones a broadcast should also go to.
          </Empty>
        ) : channels.length === 0 ? (
          <Empty icon="hash" title="The bot is not in any channel yet" />
        ) : (
          <div className="rows">
            {channels.map((c) => (
              <div className="row" key={c.id}>
                <span className="empty-icon" style={{ width: 36, height: 36, margin: 0 }}>
                  <Icon name="hash" size={16} />
                </span>
                <div className="row-main">
                  <div className="row-title">{c.name}</div>
                  <div className="row-sub">{c.guild}</div>
                </div>
                <Switch on={selected.has(c.id)} onChange={() => toggle(c.id)} label={c.name} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
