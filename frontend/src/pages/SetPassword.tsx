import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import { BrandMark } from "../routes/Shell";
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
    <div className="auth" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="auth-form">
        <div className="auth-card">
          <BrandMark large />
          <div>
            <h1 className="auth-title">Set a new password</h1>
            <p className="page-sub">Your admin created this account with a temporary password. Choose your own to continue.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <Card>
              <div className="stack">
                <Field label="New password" hint="At least 8 characters.">
                  <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus autoComplete="new-password" />
                </Field>
                <Field label="Confirm new password">
                  <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
                </Field>
                {error && <Alert tone="bad">{error}</Alert>}
                <Button type="submit" variant="primary" size="lg" block loading={busy}>
                  {busy ? "Updating…" : "Update password"}
                </Button>
              </div>
            </Card>
          </form>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={logout}>
            Log out instead
          </button>
        </div>
      </div>
    </div>
  );
}
