import { Link } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { AvatarBadge } from "../components/Small";
import { useAuth } from "../auth/AuthContext";
import { useProfiles } from "../profile/ProfileContext";

export function Home() {
  const { user, logout } = useAuth();
  const { profiles, activeProfile, setActiveProfileId, isLoading } = useProfiles();

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600 }}>
            {user?.email}
          </div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <Link
          to="/profiles"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px 5px 5px",
            borderRadius: 999,
            background: "var(--glass)",
            border: "1px solid var(--stroke)",
            backdropFilter: "blur(20px)",
            boxShadow: "var(--shadow)",
          }}
        >
          <AvatarBadge seed={activeProfile?.label || "?"} size={30} fontSize={12.5} />
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text2)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Link>
      </div>

      {isLoading ? (
        <GlassCard>
          <div style={{ color: "var(--text3)", fontSize: 13.5, textAlign: "center", padding: 12 }}>
            Loading profiles…
          </div>
        </GlassCard>
      ) : profiles.length === 0 ? (
        <GlassCard>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            No Telegram profiles yet.{" "}
            <Link to="/profiles" style={{ fontWeight: 700 }}>
              Add one
            </Link>{" "}
            to get started.
          </div>
        </GlassCard>
      ) : (
        <GlassCard>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>
            Active profile
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveProfileId(p.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 16,
                  border:
                    p.id === activeProfile?.id ? "1.5px solid var(--accent)" : "1px solid var(--stroke)",
                  background: "var(--field)",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  color: "var(--text)",
                }}
              >
                <AvatarBadge seed={p.label} size={32} fontSize={12} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</span>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div style={{ color: "var(--text3)", fontSize: 13.5, textAlign: "center", padding: "12px 0" }}>
          Full dashboard (broadcast progress ring, quick stats, recent activity) coming in
          Phase 3.
        </div>
      </GlassCard>

      <button
        type="button"
        onClick={logout}
        style={{
          textAlign: "center",
          fontSize: 13.5,
          fontWeight: 700,
          color: "var(--bad)",
          padding: 10,
          cursor: "pointer",
          background: "none",
          border: "none",
        }}
      >
        Log out
      </button>
    </div>
  );
}
