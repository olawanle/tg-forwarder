import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { Field, Input } from "../components/Field";
import { Button } from "../components/Button";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";

export function SetPassword() {
  const { markPasswordChanged, logout } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { new_password: pw });
      markPasswordChanged();
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--no-nav">
      <div style={{ paddingTop: 24 }}>
        <div className="page-title">
          Set a new
          <br />
          password
        </div>
        <div className="page-subtitle">
          Your admin created this account with a temporary password. Choose a real one to
          continue.
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="New password">
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Confirm new password">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
            {error && (
              <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600 }}>{error}</div>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </div>
        </GlassCard>
      </form>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <button
          type="button"
          onClick={logout}
          style={{
            background: "none",
            border: "none",
            color: "var(--text3)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Log out instead
        </button>
      </div>
    </div>
  );
}
