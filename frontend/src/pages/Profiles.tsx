import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { AvatarBadge, ToggleSwitch } from "../components/Small";
import { IconButton } from "../components/Small";
import { Button } from "../components/Button";
import { useAuth } from "../auth/AuthContext";
import { useProfiles } from "../profile/ProfileContext";
import { useTheme } from "../theme/useTheme";
import { AddProfileWizard } from "./AddProfileWizard";

export function Profiles() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { profiles, activeProfile, setActiveProfileId, isLoading } = useProfiles();
  const [wizardOpen, setWizardOpen] = useState(false);
  const { theme, toggle } = useTheme();

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
            </div>
          </GlassCard>
        ))
      )}

      <Button variant="outline" onClick={() => setWizardOpen(true)}>
        + Add a Telegram profile
      </Button>

      {wizardOpen && (
        <AddProfileWizard
          onClose={() => setWizardOpen(false)}
          onDone={(profileId) => {
            setActiveProfileId(profileId);
            setWizardOpen(false);
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
