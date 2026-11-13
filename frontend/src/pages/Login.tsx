import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, Field, Input } from "../components/ui";
import { BrandMark } from "../routes/Shell";
import { useAuth } from "../auth/AuthContext";
import { api, ApiError } from "../api/client";
import type { LoginStepResponse, TotpSetupConfirmResponse } from "../api/types";
import { BRAND_TAGLINE } from "../theme/accent";

type Step =
  | { kind: "password" }
  | { kind: "totp"; preAuthToken: string }
  | { kind: "setup"; preAuthToken: string; secret: string; qrDataUri: string }
  | { kind: "backup-codes"; codes: string[] };

function CodeStep({
  busy,
  error,
  onSubmit,
  extra,
}: {
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
      <Card>
        <div className="stack">
          {extra}
          <Field label="6-digit code, or a backup code">
            <Input className="input--code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {busy ? "Verifying…" : "Continue"}
          </Button>
        </div>
      </Card>
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
      if (res.status === "done") {
        // Admin granted this account a 2FA exemption -- no further step.
        completeLogin({
          token: res.token!,
          user_id: res.user_id!,
          email: res.email!,
          role: res.role!,
          must_change_password: res.must_change_password!,
          backup_codes: [],
        });
        navigate("/home", { replace: true });
      } else if (res.status === "totp_required") {
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

  let title = "Welcome back";
  let sub = "Sign in to your workspace.";
  let card: ReactNode;
  if (step.kind === "password") {
    card = (
      <form onSubmit={handlePasswordSubmit}>
        <Card>
          <div className="stack">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </Field>
            {error && <Alert tone="bad">{error}</Alert>}
            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </Card>
      </form>
    );
  } else if (step.kind === "totp") {
    title = "Verify it's you";
    sub = "Enter the 6-digit code from your authenticator app, or one of your backup codes.";
    card = <CodeStep busy={busy} error={error} onSubmit={handleTotpSubmit} />;
  } else if (step.kind === "setup") {
    title = "Set up 2-step login";
    sub = "Scan this with Google Authenticator or any compatible app, then enter the code it shows. It is required before you can continue.";
    card = (
      <CodeStep
        busy={busy}
        error={error}
        onSubmit={handleSetupConfirm}
        extra={
          <div className="stack stack--sm" style={{ alignItems: "center" }}>
            <img className="qr" src={step.qrDataUri} alt="2FA QR code" />
            <div className="hint" style={{ textAlign: "center" }}>
              Can't scan? Enter this key manually:
              <div className="mono" style={{ color: "var(--text-2)", marginTop: 4, wordBreak: "break-all", fontWeight: 600 }}>
                {step.secret}
              </div>
            </div>
          </div>
        }
      />
    );
  } else {
    title = "Save your backup codes";
    sub = "Each one signs you in once if you lose your authenticator. They won't be shown again, so store them somewhere safe now.";
    card = (
      <Card>
        <div className="stack">
          <div className="codes">
            {step.codes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
          <Button icon="copy" onClick={() => navigator.clipboard?.writeText(step.codes.join("\n"))}>
            Copy all
          </Button>
          <Button variant="primary" size="lg" block onClick={() => navigate("/home", { replace: true })}>
            I've saved them, continue
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <span className="orbit" />
        <span className="orbit" />
        <span className="orbit" />
        <div className="cluster" style={{ position: "relative" }}>
          <BrandMark />
          <div>
            <div className="brand-name">Forwarder</div>
            <div className="brand-tag">{BRAND_TAGLINE}</div>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div className="auth-headline">
            One message.
            <br />
            Every group,
            <br />
            <em>at once.</em>
          </div>
          <p className="page-sub" style={{ fontSize: 15, maxWidth: 400, marginTop: 18 }}>
            Queue a broadcast from any of your Telegram accounts and watch it land, group by group, with a live finish time.
          </p>
        </div>
        <ul className="auth-points" style={{ position: "relative" }}>
          <li>
            <Icon name="zap" size={17} />
            Runs on the server, even with the app closed
          </li>
          <li>
            <Icon name="clock" size={17} />
            Real-time progress and estimated completion
          </li>
          <li>
            <Icon name="shield" size={17} />
            2-step login on every account
          </li>
        </ul>
      </aside>

      <main className="auth-form">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <BrandMark large />
          </div>
          <div>
            <h1 className="auth-title">{title}</h1>
            <p className="page-sub">{sub}</p>
          </div>
          {card}
          {step.kind === "password" && (
            <p className="hint" style={{ textAlign: "center" }}>
              Accounts are created by your admin. There is no self-registration.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
