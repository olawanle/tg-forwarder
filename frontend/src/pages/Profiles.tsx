import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../components/Icon";
import { Alert, Avatar, Button, Card, PageHead, Pill, Sheet, Skeleton } from "../components/ui";
import { useProfiles } from "../profile/ProfileContext";
import { AddProfileWizard } from "./AddProfileWizard";
import { BroadcastAllButton } from "../components/BroadcastAll";
import { api, ApiError } from "../api/client";
import type { Profile } from "../api/types";

export function Profiles() {
  const qc = useQueryClient();
  const { profiles, activeProfile, setActiveProfileId, isLoading } = useProfiles();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reconnectProfile, setReconnectProfile] = useState<Profile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function removeProfile(p: Profile) {
    setDeleteError("");
    setBusyId(p.id);
    try {
      await api.del(`/profiles/${p.id}`);
      qc.invalidateQueries({ queryKey: ["profiles"] });
      setConfirmDelete(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not remove this profile.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <PageHead
        title="Profiles"
        sub="One profile is one Telegram account. Broadcasts go out from whichever one is active."
        actions={
          <>
            <BroadcastAllButton />
            <Button variant="primary" icon="plus" onClick={() => setWizardOpen(true)}>
              Add profile
            </Button>
          </>
        }
      />

      <div className="grid grid--cards">
        {isLoading &&
          [0, 1].map((i) => (
            <Card key={i}>
              <Skeleton width="60%" height={18} />
              <Skeleton width="40%" style={{ marginTop: 10 }} />
              <Skeleton height={34} style={{ marginTop: 22 }} />
            </Card>
          ))}

        {profiles.map((p) => {
          const active = p.id === activeProfile?.id;
          return (
            <Card key={p.id} className={`profile-card ${active ? "is-active" : ""}`}>
              <div className="cluster" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <Avatar name={p.label} size={46} />
                <div className="grow">
                  <div className="section-title truncate">{p.label}</div>
                  <div className="mono faint" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {p.phone || "No number on file"}
                  </div>
                </div>
                {active && <Pill tone="accent">Active</Pill>}
              </div>
              <div className="spread">
                <Pill tone={p.has_session ? "ok" : "bad"} dot>
                  {p.has_session ? "Connected" : "No session"}
                </Pill>
              </div>
              <div className="btn-row">
                {active ? (
                  <Button size="sm" className="grow" disabled icon="check">
                    In use
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" className="grow" onClick={() => setActiveProfileId(p.id)}>
                    Switch to this
                  </Button>
                )}
                <Button size="sm" icon="refresh" onClick={() => setReconnectProfile(p)} disabled={busyId === p.id}>
                  Reconnect
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="btn--icon"
                  aria-label={`Remove ${p.label}`}
                  onClick={() => {
                    setDeleteError("");
                    setConfirmDelete(p);
                  }}
                  disabled={busyId === p.id}
                >
                  <Icon name="trash" size={15} />
                </Button>
              </div>
            </Card>
          );
        })}

        {!isLoading && (
          <button type="button" className="card add-card" onClick={() => setWizardOpen(true)}>
            <Icon name="plus" size={22} />
            Add a Telegram profile
          </button>
        )}
      </div>

      {(wizardOpen || reconnectProfile) && (
        <AddProfileWizard
          reconnectProfile={reconnectProfile ? { id: reconnectProfile.id, label: reconnectProfile.label } : undefined}
          onClose={() => {
            setWizardOpen(false);
            setReconnectProfile(null);
          }}
          onDone={(profileId) => {
            setActiveProfileId(profileId);
            setWizardOpen(false);
            setReconnectProfile(null);
          }}
        />
      )}

      {confirmDelete && (
        <Sheet onClose={() => (busyId ? undefined : setConfirmDelete(null))}>
          <div className="cluster" style={{ flexWrap: "nowrap" }}>
            <Avatar name={confirmDelete.label} size={44} />
            <div className="grow">
              <div className="sheet-title">Remove "{confirmDelete.label}"?</div>
              {confirmDelete.phone && <div className="mono faint" style={{ fontSize: 12.5, marginTop: 2 }}>{confirmDelete.phone}</div>}
            </div>
          </div>
          <div className="sheet-sub" style={{ marginTop: 0 }}>
            This deletes its send history, job logs and blacklist for good. The Telegram account itself isn't touched, and you
            can connect it again later. <strong style={{ color: "var(--bad)" }}>This can't be undone.</strong>
          </div>
          {deleteError && <Alert tone="bad">{deleteError}</Alert>}
          <div className="btn-row">
            <Button className="grow" onClick={() => setConfirmDelete(null)} disabled={busyId === confirmDelete.id}>
              Keep it
            </Button>
            <Button variant="danger" className="grow" onClick={() => removeProfile(confirmDelete)} loading={busyId === confirmDelete.id}>
              {busyId === confirmDelete.id ? "Removing…" : "Remove profile"}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
