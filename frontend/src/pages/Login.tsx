import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { Field, Input } from "../components/Field";
import { Button } from "../components/Button";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";

const MARK = (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
    <path
      d="m22 2-7 20-4-9-9-4Z"
      fill="none"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

  const form = (
    <>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field label="Password">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <Button type="submit" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </Button>
    </>
  );

  return (
    <>
      {/* Mobile: centered card, below 900px */}
      <div className="page page--no-nav login-mobile" style={{ justifyContent: "center", minHeight: "100dvh" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <div
            style={{
              width: 76,
              height: 76,
              padding: 22,
              borderRadius: 24,
              background: "var(--accent-grad)",
              boxShadow: "0 14px 34px var(--accent-soft), inset 0 1.5px 0 rgba(255,255,255,0.5)",
            }}
          >
            {MARK}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.03em" }}>Group Forwarder</div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 6, lineHeight: 1.45 }}>
              One message. Every group.
              <br />
              Broadcast from your Telegram profiles.
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <GlassCard>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{form}</div>
          </GlassCard>
        </form>
        <div style={{ fontSize: 12.5, color: "var(--text3)", textAlign: "center", lineHeight: 1.5, padding: "0 10px", marginTop: 14 }}>
          Accounts are created by your admin. There's no self-registration.
        </div>
      </div>

      {/* Desktop: split screen brand moment, 900px+ */}
      <div className="login-desktop">
        <div className="d-login-brand">
          <div
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              top: "50%",
              left: -60,
              transform: "translateY(-50%)",
              borderRadius: "50%",
              border: "1.5px solid #ff3b5c",
              animation: "pulseRing 3.4s cubic-bezier(.2,.6,.4,1) infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              top: "50%",
              left: -60,
              transform: "translateY(-50%)",
              borderRadius: "50%",
              border: "1.5px solid #ff9a3c",
              animation: "pulseRing 3.4s cubic-bezier(.2,.6,.4,1) infinite",
              animationDelay: "1.1s",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                width: 52,
                height: 52,
                padding: 15,
                borderRadius: 16,
                background: "var(--accent-grad)",
                boxShadow: "0 16px 34px rgba(255,88,76,0.35)",
                marginBottom: 26,
              }}
            >
              {MARK}
            </div>
            <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, textWrap: "balance" }}>
              One message.
              <br />
              Every group,
              <br />
              at once.
            </div>
            <div style={{ fontSize: 14, color: "#a9acc0", marginTop: 14, maxWidth: 360, lineHeight: 1.6 }}>
              Forwarder keeps every Telegram and Discord profile you manage in sync — queue a send,
              watch it land in real time.
            </div>
          </div>
        </div>
        <div className="d-login-form">
          <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ marginBottom: 6 }}>
              <div className="page-title" style={{ fontSize: 24 }}>
                Welcome back
              </div>
              <div className="page-subtitle">Sign in to your workspace.</div>
            </div>
            {form}
            <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textAlign: "center" }}>
              Accounts are created by your admin. There's no self-registration.
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
