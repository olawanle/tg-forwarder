import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Field, Input, Sheet } from "../components/ui";
import { api, ApiError } from "../api/client";

type Step = "phone" | "code" | "password" | "paste";
const ORDER: Step[] = ["phone", "code", "password"];

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
      const res = await api.post<{ wizard_token: string }>("/profiles/phone/send-code", {
        label: label.trim(),
        phone: phone.trim(),
        profile_id: reconnectProfile?.id,
      });
      setWizardToken(res.wizard_token);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
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
    <Sheet onClose={onClose}>
      {step !== "paste" && (
        <div className="steps">
          {ORDER.map((s, i) => (
            <i key={s} className={ORDER.indexOf(step) >= i ? "on" : ""} />
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
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("paste")}>
            Advanced: paste an existing session string
          </button>
        </>
      )}

      {step === "code" && (
        <>
          <div>
            <div className="sheet-title">Enter the code</div>
            <div className="sheet-sub">Sent to {phone}. It arrives inside Telegram, not by SMS.</div>
          </div>
          <Field label="Login code">
            <Input className="input--code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus inputMode="numeric" autoComplete="one-time-code" />
          </Field>
          {error && <Alert tone="bad">{error}</Alert>}
          <Button variant="primary" size="lg" block onClick={verifyCode} loading={busy} disabled={!code.trim()}>
            {busy ? "Verifying…" : "Verify code"}
          </Button>
          <button type="button" className="link" style={{ alignSelf: "center", color: "var(--text-3)" }} onClick={() => go("phone")}>
            Start over
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
