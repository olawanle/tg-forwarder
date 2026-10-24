import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlassCard } from "../components/GlassCard";
import { Field, Input } from "../components/Field";
import { Button } from "../components/Button";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import type { LoginStepResponse, TotpSetupConfirmResponse } from "../api/types";

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

type Step =
  | { kind: "password" }
  | { kind: "totp"; preAuthToken: string }
  | { kind: "setup"; preAuthToken: string; secret: string; qrDataUri: string }
  | { kind: "backup-codes"; codes: string[] };

function CodeStep({
  title,
  subtitle,
  busy,
  error,
  onSubmit,
  extra,
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  error: string;
  onSubmit: (code: string) => void;
  extra?: ReactNode;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(code.trim());
      }}
    >
      <GlassCard premium>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 3, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          </div>
          {extra}
          <Field label="6-digit code (or a backup code)">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoFocus
              required
            />
          </Field>
          {error && <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <Button type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Continue"}
          </Button>
        </div>
      </GlassCard>
    </form>
  );
}

export function Login() {
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [error, setError] = useState(
    searchParams.get("expired") ? "Your session expired — log in again to continue." : "",
  );
  const [busy, setBusy] = useState(false);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post<LoginStepResponse>("/auth/login", { email, password });
      if (res.status === "totp_required") {
        setStep({ kind: "totp", preAuthToken: res.pre_auth_token! });
      } else {
        setStep({
          kind: "setup",
          preAuthToken: res.pre_auth_token!,
          secret: res.totp_secret!,
          qrDataUri: res.totp_qr_data_uri!,
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTotpSubmit(code: string) {
    if (step.kind !== "totp") return;
    setError("");
    setBusy(true);
    try {
      const res = await api.post<TotpSetupConfirmResponse>("/auth/login/totp", {
        pre_auth_token: step.preAuthToken,
        code,
      });
      completeLogin(res);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetupConfirm(code: string) {
    if (step.kind !== "setup") return;
    setError("");
    setBusy(true);
    try {
      const res = await api.post<TotpSetupConfirmResponse>("/auth/totp/setup/confirm", {
        pre_auth_token: step.preAuthToken,
        code,
      });
      completeLogin(res);
      setStep({ kind: "backup-codes", codes: res.backup_codes });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  let card: ReactNode;
  if (step.kind === "password") {
    card = (
      <form onSubmit={handlePasswordSubmit}>
        <GlassCard premium>
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
            {error && <div style={{ color: "var(--bad)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
            <Button type="submit" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </div>
        </GlassCard>
      </form>
    );
  } else if (step.kind === "totp") {
    card = (
      <CodeStep
        title="Verify it's you"
        subtitle="Enter the 6-digit code from your authenticator app, or one of your backup codes."
        busy={busy}
        error={error}
        onSubmit={handleTotpSubmit}
      />
    );
  } else if (step.kind === "setup") {
    card = (
      <CodeStep
        title="Set up 2-factor login"
        subtitle="Scan this with Google Authenticator (or any compatible app), then enter the 6-digit code it shows. This is required before you can continue."
        busy={busy}
        error={error}
        onSubmit={handleSetupConfirm}
        extra={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <img
              src={step.qrDataUri}
              alt="2FA QR code"
              style={{ width: 176, height: 176, borderRadius: 16, background: "#fff", padding: 8 }}
            />
            <div style={{ fontSize: 11.5, color: "var(--text3)", textAlign: "center" }}>
              Can't scan? Enter this manually:
              <div
                className="mono"
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginTop: 3,
                  wordBreak: "break-all",
                  color: "var(--text2)",
                }}
              >
                {step.secret}
              </div>
            </div>
          </div>
        }
      />
    );
  } else {
    card = (
      <GlassCard premium>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Save your backup codes
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 3, lineHeight: 1.4 }}>
              Each code logs you in once if you ever lose access to your authenticator app. They
              won't be shown again — save them somewhere safe now.
            </div>
          </div>
          <div
            className="mono"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              background: "var(--glass-2)",
              borderRadius: 14,
              padding: 14,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {step.codes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <Button
            variant="outline"
            small
            type="button"
            onClick={() => navigator.clipboard?.writeText(step.codes.join("\n"))}
          >
            Copy all
          </Button>
          <Button type="button" onClick={() => navigate("/home", { replace: true })}>
            I've saved these — continue
          </Button>
        </div>
      </GlassCard>
    );
  }

  const footer =
    step.kind === "password" ? (
      <div style={{ fontSize: 12.5, color: "var(--text3)", textAlign: "center", lineHeight: 1.5, padding: "0 10px", marginTop: 14 }}>
        Accounts are created by your admin. There's no self-registration.
      </div>
    ) : null;

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
              boxShadow:
                "0 14px 34px var(--accent-soft), inset 0 1.5px 0 rgba(255,255,255,0.5), var(--premium-ring)",
            }}
          >
            {MARK}
          </div>
          <div style={{ textAlign: "center" }}>
            <div className="eyebrow-premium" style={{ justifyContent: "center", marginBottom: 4 }}>
              Private workspace
            </div>
            <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.03em" }}>Group Forwarder</div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 6, lineHeight: 1.45 }}>
              One message. Every group.
              <br />
              Broadcast from your Telegram profiles.
            </div>
          </div>
        </div>

        {card}
        {footer}
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
                boxShadow:
                  "0 16px 34px rgba(255,88,76,0.35), 0 0 0 1px rgba(226,191,114,0.4), 0 8px 22px rgba(226,191,114,0.14)",
                marginBottom: 14,
              }}
            >
              {MARK}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                color: "#e2bf72",
                marginBottom: 12,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "linear-gradient(135deg, #d7ae5c, #f3e2b0)" }} />
              Private workspace
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
          <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ marginBottom: 6 }}>
              <div className="page-title" style={{ fontSize: 24 }}>
                Welcome back
              </div>
              <div className="page-subtitle">Sign in to your workspace.</div>
            </div>
            {card}
            {footer}
          </div>
        </div>
      </div>
    </>
  );
}
