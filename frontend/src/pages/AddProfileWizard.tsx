import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "../components/BottomSheet";
import { Field, Input } from "../components/Field";
import { Button } from "../components/Button";
import { api, ApiError } from "../api/client";

type Step = "phone" | "code" | "password" | "paste";

interface Props {
  onClose: () => void;
  onDone: (profileId: number) => void;
}

export function AddProfileWizard({ onClose, onDone }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("phone");
  const [label, setLabel] = useState("");
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
      const res = await api.post<{ needs_password: boolean; profile_id?: number }>(
        "/profiles/phone/verify-code",
        { wizard_token: wizardToken, code: code.replace(/\s/g, "") },
      );
      if (res.needs_password) {
        setStep("password");
      } else if (res.profile_id) {
        finish(res.profile_id);
      }
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
      });
      finish(res.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet onClose={onClose}>
      {step !== "paste" && (
        <div style={{ display: "flex", gap: 6 }}>
          {["phone", "code", "password"].map((s, i) => {
            const order = ["phone", "code", "password"];
            const reached = order.indexOf(step) >= i;
            return (
              <span
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  background: reached ? "var(--accent-grad)" : "var(--hair)",
                }}
              />
            );
          })}
        </div>
      )}

      {step === "phone" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Add a profile
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 5, lineHeight: 1.45 }}>
              Same flow Telegram uses for any new device — no computer needed.
            </div>
          </div>
          <Field label="Profile name">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My main account" autoFocus />
          </Field>
          <Field label="Phone number">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              type="tel"
            />
          </Field>
          {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
          <Button onClick={sendCode} disabled={busy}>
            {busy ? "Sending…" : "Send login code"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("paste");
            }}
            style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 12.5, cursor: "pointer" }}
          >
            Advanced: paste an existing session string
          </button>
        </div>
      )}

      {step === "code" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Enter the code
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 5, lineHeight: 1.45 }}>
              Sent to {phone} — it arrives inside Telegram, not by SMS.
            </div>
          </div>
          <Field label="Login code">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              inputMode="numeric"
            />
          </Field>
          {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
          <Button onClick={verifyCode} disabled={busy || !code.trim()}>
            {busy ? "Verifying…" : "Verify code"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("phone");
            }}
            style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 12.5, cursor: "pointer" }}
          >
            Start over
          </button>
        </div>
      )}

      {step === "password" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Two-step password
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 5, lineHeight: 1.45 }}>
              This account has Two-Step Verification on. Enter its password to finish.
            </div>
          </div>
          <Field label="Telegram Two-Step Verification password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>
          {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
          <Button variant="secondary" onClick={verifyPassword} disabled={busy || !password}>
            {busy ? "Connecting…" : "Connect profile"}
          </Button>
        </div>
      )}

      {step === "paste" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Paste a session
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 5, lineHeight: 1.45 }}>
              For a session generated locally with the bootstrap script.
            </div>
          </div>
          <Field label="Profile name">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My main account" />
          </Field>
          <Field label="Session string">
            <Input
              type="password"
              value={sessionString}
              onChange={(e) => setSessionString(e.target.value)}
            />
          </Field>
          {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
          <Button onClick={saveSession} disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setStep("phone");
            }}
            style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 12.5, cursor: "pointer" }}
          >
            Back to phone login
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
