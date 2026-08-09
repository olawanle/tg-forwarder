import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { AvatarBadge, ToggleSwitch } from "../components/Small";
import { IconButton } from "../components/Small";
import { Button } from "../components/Button";
import { useAuth } from "../auth/AuthContext";
import { useProfiles } from "../profile/ProfileContext";
import { useTheme } from "../theme/useTheme";
import { AddProfileWizard } from "./AddProfileWizard";
import { api, ApiError } from "../api/client";
import type { Profile } from "../api/types";

export function Profiles() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { logout, user } = useAuth();
  const { profiles, activeProfile, setActiveProfileId, isLoading } = useProfiles();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reconnectProfile, setReconnectProfile] = useState<Profile | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const { theme, toggle } = useTheme();

  async function removeProfile(p: Profile) {
    if (!window.confirm(`Remove "${p.label}"? This also deletes its send history and job logs — this can't be undone.`)) {
      return;
    }
    setDeleteError("");
    setBusyId(p.id);
    try {
      await api.del(`/profiles/${p.id}`);
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not remove this profile.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page page--no-nav">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="page-title">Profiles</h1>
          <div className="page-subtitle">One profile = one Telegram account.</div>
        </div>
        <IconButton ariaLabel="Back" onClick={() => navigate("/home")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      {isLoading ? (
        <GlassCard>
          <div style={{ color: "var(--text3)", fontSize: 13.5, textAlign: "center", padding: 12 }}>
            Loading…
          </div>
        </GlassCard>
      ) : (
        profiles.map((p) => (
          <GlassCard key={p.id} onClick={() => setActiveProfileId(p.id)}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <AvatarBadge seed={p.label} size={48} fontSize={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.02em" }}>{p.label}</div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    marginTop: 7,
                    padding: "3px 9px",
                    borderRadius: 999,
                    background: p.has_session ? "var(--ok-soft)" : "var(--bad-soft)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: p.has_session ? "var(--ok)" : "var(--bad)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: p.has_session ? "var(--ok)" : "var(--bad)",
                    }}
                  >
                    {p.has_session ? "Connected" : "No session"}
                  </span>
                </span>
              </div>
              {p.id === activeProfile?.id && (
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "var(--accent-grad)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}
              <button
                type="button"
                aria-label={`Reconnect ${p.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setReconnectProfile(p);
                }}
                disabled={busyId === p.id}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  background: "var(--glass-2)",
                  border: "none",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  color: "var(--text2)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label={`Remove ${p.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeProfile(p);
                }}
                disabled={busyId === p.id}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  background: "var(--bad-soft)",
                  border: "none",
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  color: "var(--bad)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-.8 13.6a2 2 0 0 1-2 1.9H7.8a2 2 0 0 1-2-1.9L5 6" />
                </svg>
              </button>
            </div>
          </GlassCard>
        ))
      )}

      {deleteError && <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600, padding: "0 4px" }}>{deleteError}</div>}

      <Button variant="outline" onClick={() => setWizardOpen(true)}>
        + Add a Telegram profile
      </Button>

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

      {user?.role === "admin" && (
        <GlassCard onClick={() => navigate("/admin")}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 15,
                background: "var(--accent-soft)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>Admin</div>
              <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>You're the admin</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </GlassCard>
      )}

      <GlassCard soft>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Dark mode</span>
          <ToggleSwitch on={theme === "dark"} onChange={toggle} />
        </div>
      </GlassCard>

      <div
        onClick={logout}
        style={{ textAlign: "center", fontSize: 13.5, fontWeight: 700, color: "var(--bad)", padding: 10, cursor: "pointer" }}
      >
        Log out
      </div>
    </div>
  );
}
