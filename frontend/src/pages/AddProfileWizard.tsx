import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Field, Input, Sheet } from "../components/ui";
import { api, ApiError } from "../api/client";
import type { CodeDelivery } from "../api/types";
import { useNow } from "../lib/jobs";

type Step = "phone" | "email" | "email-code" | "code" | "password" | "paste" | "qr";
const ORDER: Step[] = ["phone", "code", "password"];

const METHOD: Record<string, string> = {
  sms: "by SMS",
  call: "by phone call",
  flash_call: "by a flash call",
  missed_call: "by a missed call",
  fragment_sms: "by SMS through Fragment",
};

/** Plain-language "where to look", from what Telegram actually said. */
function whereItWent(d: CodeDelivery, phone: string): string {
  switch (d.kind) {
    case "app":
      return `Telegram sent it inside the Telegram app on a device already logged in to ${phone}, as a message from "Telegram" (blue tick). It does not come by SMS.`;
    case "sms":
    case "sms_word":
    case "sms_phrase":
      return `Telegram sent it by SMS to ${phone}.`;
    case "call":
      return `Telegram is calling ${phone} and will read the code out.`;
    case "flash_call":
    case "missed_call":
      return `Telegram will give ${phone} a missed call. The code is the last ${d.length ?? 4} digits of the number that calls${d.hint ? ` (it starts ${d.hint})` : ""}.`;
    case "email":
      return `Telegram sent it to the account's login email${d.hint ? `, ${d.hint}` : ""}. Check spam too.`;
    case "fragment_sms":
      return `This is an anonymous Fragment number, so the code is on Fragment${d.hint ? ` (${d.hint})` : ""}.`;
    case "firebase_sms":
      return "Telegram wants to send this code through a channel only its own apps can receive. Use “send it another way” below.";
    default:
      return `Telegram sent it (${d.kind}). Check the Telegram app first, then SMS.`;
  }
}

interface Props {
  onClose: () => void;
  onDone: (profileId: number) => void;
  reconnectProfile?: { id: number; label: string };
}

export function AddProfileWizard({ onClose, onDone, reconnectProfile }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("phone");
  const [label, setLabel] = useState(reconnectProfile?.label ?? "");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [wizardToken, setWizardToken] = useState("");
  const [sessionString, setSessionString] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useState<CodeDelivery | null>(null);
  const [deliveredAt, setDeliveredAt] = useState(0);
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const now = useNow(1000, step === "code" && !!delivery?.next_kind);

  function arrived(d: CodeDelivery) {
    setDelivery(d);
    setDeliveredAt(Date.now());
    setCode("");
    setStep(d.kind === "email_setup_required" ? "email" : "code");
  }
  useEffect(() => setError(""), [step]);

  // ---- QR login: no code needed, the Telegram app approves it directly.
  const [qr, setQr] = useState<{ image: string | null; url: string | null; status: string } | null>(null);
  async function startQr() {
    setError("");
    if (!label.trim()) {
      setError("Give the profile a name first.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ wizard_token: string; status: string; qr_image: string | null; qr_url: string | null }>("/profiles/qr/start", {
        label: label.trim(),
        profile_id: reconnectProfile?.id,
      });
      setWizardToken(res.wizard_token);
      setQr({ image: res.qr_image, url: res.qr_url, status: res.status });
      setStep("qr");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start QR login.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (step !== "qr" || !wizardToken) return;
    let stopped = false;
    const id = window.setInterval(async () => {
      try {
        const res = await api.post<{ status: string; qr_image: string | null; qr_url: string | null; profile_id: number | null; error: string | null }>(
          "/profiles/qr/status",
          { wizard_token: wizardToken },
        );
        if (stopped) return;
        if (res.status === "waiting") setQr({ image: res.qr_image, url: res.qr_url, status: res.status });
        else if (res.status === "done" && res.profile_id) finish(res.profile_id);
        else if (res.status === "password") setStep("password");
        else {
          setQr((q) => (q ? { ...q, status: res.status } : q));
          setError(res.error || "The QR code expired before it was scanned. Try again.");
        }
        if (res.status !== "waiting") window.clearInterval(id);
      } catch (err) {
        if (!stopped) setError(err instanceof ApiError ? err.message : "Lost track of the QR login. Try again.");
        window.clearInterval(id);
      }
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, wizardToken]);
  function leaveQr(next: Step) {
    if (wizardToken && qr?.status === "waiting") api.post("/profiles/qr/cancel", { wizard_token: wizardToken }).catch(() => {});
    setQr(null);
    go(next);
  }

  function finish(profileId: number) {
    qc.invalidateQueries({ queryKey: ["profiles"] });
    onDone(profileId);
  }

  async function sendCode() {
    setError("");
    if (!label.trim() || !phone.trim()) {
      setError("Enter both a profile name and a phone number.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ wizard_token: string; delivery: CodeDelivery | null }>("/profiles/phone/send-code", {
        label: label.trim(),
        phone: phone.trim(),
        profile_id: reconnectProfile?.id,
      });
      setWizardToken(res.wizard_token);
      arrived(res.delivery ?? { kind: "app", length: null, hint: null, next_kind: null, timeout: null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function wizardCall<T>(path: string, body: object, fallback: string): Promise<T | null> {
    setError("");
    setBusy(true);
    try {
      return await api.post<T>(path, { wizard_token: wizardToken, ...body });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const res = await wizardCall<{ delivery: CodeDelivery }>("/profiles/phone/resend-code", {}, "Could not resend the code.");
    if (res) arrived(res.delivery);
  }

  async function sendEmailCode() {
    const res = await wizardCall<{ delivery: CodeDelivery }>("/profiles/phone/setup-email", { email: email.trim() }, "Could not send the email.");
    if (res) {
      setEmailHint(res.delivery.hint ?? email.trim());
      setEmailCode("");
      setStep("email-code");
    }
  }

  async function confirmEmail() {
    const res = await wizardCall<{ delivery: CodeDelivery }>("/profiles/phone/verify-email", { code: emailCode.replace(/\s/g, "") }, "Could not confirm the email.");
    if (res) arrived(res.delivery);
  }

  async function verifyCode() {
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ needs_password: boolean; profile_id?: number }>("/profiles/phone/verify-code", {
        wizard_token: wizardToken,
        code: code.replace(/\s/g, ""),
      });
      if (res.needs_password) setStep("password");
      else if (res.profile_id) finish(res.profile_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPassword() {
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ profile_id: number }>("/profiles/phone/verify-password", {
        wizard_token: wizardToken,
        password,
      });
      finish(res.profile_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incorrect password.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSession() {
    setError("");
    if (!label.trim() || !sessionString.trim()) {
      setError("Both a name and a session string are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ id: number }>("/profiles/session", {
        label: label.trim(),
        session_string: sessionString.trim(),
        profile_id: reconnectProfile?.id,
      });
      finish(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }

  function go(next: Step) {
    setError("");
    setStep(next);
  }

  return (
    <Sheet
      onClose={() => {
        if (wizardToken && qr?.status === "waiting") api.post("/profiles/qr/cancel", { wizard_token: wizardToken }).catch(() => {});
        onClose();
      }}
    >
      {step !== "paste" && (
        <div className="steps">
          {ORDER.map((s, i) => (
            <i key={s} className={ORDER.indexOf(step.startsWith("email") || step === "qr" ? "code" : step) >= i ? "on" : ""} />
          ))}
        </div>
      )}

      {step === "phone" && (
        <>
          <div>
            <div className="sheet-title">{reconnectProfile ? "Reconnect profile" : "Add a profile"}</div>
            <div className="sheet-sub">
              {reconnectProfile
                ? "Log back in for this profile. Its history and stats stay exactly as they are."
                : "The same login Telegram uses for any new device. No computer needed."}
            </div>
          </div>
          <Field label="Profile name">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main account" autoFocus={!reconnectProfile} disabled={!!reconnectProfile} />
          </Field>
          <Field label="Phone number" hint="With country code, the way Telegram shows it.">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 803 555 0142" type="tel" autoFocus={!!reconnectProfile} />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={sendCode} loading={busy}>
            {busy ? "Sending…" : "Send login code"}
          </Button>
          <Button size="lg" block icon="link" onClick={startQr} disabled={busy}>
            Log in with a QR code instead
          </Button>
          <p className="hint" style={{ textAlign: "center", marginTop: -6 }}>No code needed. Use this if the code never arrives.</p>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("paste")}>
            Advanced: paste an existing session string
          </button>
        </>
      )}

      {step === "code" && delivery && (
        <>
          <div>
            <div className="sheet-title">Enter the code</div>
            <div className="sheet-sub">{whereItWent(delivery, phone)}</div>
          </div>
          <Field label={delivery.length ? `${delivery.length}-digit login code` : "Login code"}>
            <Input className="input--code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus inputMode="numeric" autoComplete="one-time-code" />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={verifyCode} loading={busy} disabled={!code.trim()}>
            {busy ? "Verifying…" : "Verify code"}
          </Button>
          {delivery.next_kind && (() => {
            const wait = Math.max(0, Math.ceil(((delivery.timeout ?? 0) * 1000 - (now - deliveredAt)) / 1000));
            return (
              <Button block onClick={resend} disabled={busy || wait > 0}>
                {wait > 0 ? `Didn't get it? Send ${METHOD[delivery.next_kind] ?? "another way"} in ${wait}s` : `Didn't get it? Send it ${METHOD[delivery.next_kind] ?? "another way"}`}
              </Button>
            );
          })()}
          <Button block icon="link" onClick={startQr} disabled={busy}>
            Code not coming? Log in with a QR code
          </Button>
          <p className="hint">Don't share or forward the code in any chat: Telegram cancels codes that get sent on.</p>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("phone")}>
            Start over
          </button>
        </>
      )}

      {step === "qr" && qr && (
        <>
          <div>
            <div className="sheet-title">Scan with Telegram</div>
            <div className="sheet-sub">
              On the phone where this account is logged in, open Telegram → <b>Settings</b> → <b>Devices</b> → <b>Scan QR</b> (or <b>Link Desktop
              Device</b>), and point the camera at this code. It refreshes by itself.
            </div>
          </div>
          {qr.status === "waiting" && qr.image ? (
            <div className="stack stack--sm" style={{ alignItems: "center" }}>
              <img className="qr" src={qr.image} alt="Telegram login QR code" />
              <span className="hint">
                <span className="dot dot--live" style={{ display: "inline-block", color: "var(--accent)", marginRight: 6 }} />
                Waiting for the scan…
              </span>
            </div>
          ) : null}
          {qr.status === "waiting" && (
            <Alert>
              The code has to be scanned by the phone's camera; Telegram blocks opening it on the same phone. If this page is open on
              that phone, open it on a computer or another phone instead, log in there, and scan from this phone.
            </Alert>
          )}
          {error && <Alert tone="bad">{error}</Alert>}
          {qr.status !== "waiting" && (
            <Button variant="primary" size="lg" block onClick={startQr} loading={busy}>
              New QR code
            </Button>
          )}
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => leaveQr("phone")}>
            Use a login code instead
          </button>
        </>
      )}

      {step === "email" && (
        <>
          <div>
            <div className="sheet-title">Add a login email</div>
            <div className="sheet-sub">
              Telegram needs a login email on this account before it will send a code. Enter one you can open now; Telegram emails it a
              confirmation code.
            </div>
          </div>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus autoComplete="email" />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={sendEmailCode} loading={busy} disabled={!email.includes("@")}>
            {busy ? "Sending…" : "Email me a code"}
          </Button>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("phone")}>
            Start over
          </button>
        </>
      )}

      {step === "email-code" && (
        <>
          <div>
            <div className="sheet-title">Check your email</div>
            <div className="sheet-sub">Telegram sent a confirmation code to {emailHint}. Check spam too.</div>
          </div>
          <Field label="Email code">
            <Input className="input--code" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} autoFocus inputMode="numeric" autoComplete="one-time-code" />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={confirmEmail} loading={busy} disabled={!emailCode.trim()}>
            {busy ? "Confirming…" : "Confirm email"}
          </Button>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("email")}>
            Use a different email
          </button>
        </>
      )}

      {step === "password" && (
        <>
          <div>
            <div className="sheet-title">Two-step password</div>
            <div className="sheet-sub">This account has Two-Step Verification on. Enter its password to finish.</div>
          </div>
          <Field label="Telegram Two-Step Verification password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={verifyPassword} loading={busy} disabled={!password}>
            {busy ? "Connecting…" : "Connect profile"}
          </Button>
        </>
      )}

      {step === "paste" && (
        <>
          <div>
            <div className="sheet-title">Paste a session</div>
            <div className="sheet-sub">For a session generated locally with the bootstrap script.</div>
          </div>
          <Field label="Profile name">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main account" disabled={!!reconnectProfile} />
          </Field>
          <Field label="Session string">
            <Input type="password" value={sessionString} onChange={(e) => setSessionString(e.target.value)} />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={saveSession} loading={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("phone")}>
            Back to phone login
          </button>
        </>
      )}
    </Sheet>
  );
}
