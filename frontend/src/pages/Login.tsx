import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { Field, Input } from "../components/Field";
import { Button } from "../components/Button";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="page page--no-nav"
      style={{ justifyContent: "center", minHeight: "100dvh" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
            background: "linear-gradient(180deg, #4aa8ff, #0064d8)",
            boxShadow: "0 14px 34px rgba(0,102,216,0.45), inset 0 1.5px 0 rgba(255,255,255,0.65)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.03em" }}>
            Group Forwarder
          </div>
          <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 6, lineHeight: 1.45 }}>
            One message. Every group.
            <br />
            Broadcast from your Telegram profiles.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <GlassCard>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && (
              <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600 }}>{error}</div>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </div>
        </GlassCard>
      </form>
      <div
        style={{
          fontSize: 12.5,
          color: "var(--text3)",
          textAlign: "center",
          lineHeight: 1.5,
          padding: "0 10px",
          marginTop: 14,
        }}
      >
        Accounts are created by your admin. There's no self-registration.
      </div>
    </div>
  );
}
