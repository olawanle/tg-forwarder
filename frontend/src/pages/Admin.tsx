import { useNavigate } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { IconButton } from "../components/Small";

export function Admin() {
  const navigate = useNavigate();
  return (
    <div className="page page--no-nav">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="page-title">Admin</h1>
          <div className="page-subtitle">The only way anyone gets an account.</div>
        </div>
        <IconButton ariaLabel="Back" onClick={() => navigate("/profiles")}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </IconButton>
      </div>
      <GlassCard>
        <div style={{ color: "var(--text3)", fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>
          User management (create/deactivate/reset password) lands in Phase 3.
        </div>
      </GlassCard>
    </div>
  );
}
