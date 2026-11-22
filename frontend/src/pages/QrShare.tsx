import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert } from "../components/ui";
import { BrandMark } from "../routes/Shell";
import { api } from "../api/client";

type Shared = { status: "waiting" | "done" | "closed"; qr_image: string | null; expires_in: number | null };

/** The login QR on its own, opened from a shared link on a second screen
 * (a computer, tablet or someone else's phone) so it can be scanned with
 * the phone the Telegram account is on. Needs no login here. */
export function QrShare() {
  const { key = "" } = useParams();
  const [data, setData] = useState<Shared | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    async function poll() {
      try {
        const res = await api.get<Shared>(`/profiles/qr/shared/${encodeURIComponent(key)}`);
        if (!alive) return;
        setData(res);
        setFailed(false);
        if (res.status !== "waiting") return;
      } catch {
        if (alive) setFailed(true);
      }
      if (alive) timer = window.setTimeout(poll, 2000);
    }
    poll();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [key]);

  return (
    <div className="qr-share">
      <div className="qr-share-card">
        <div style={{ display: "flex", justifyContent: "center" }}>
          <BrandMark />
        </div>
        {data?.status === "waiting" && data.qr_image ? (
          <>
            <h1 className="auth-title" style={{ textAlign: "center" }}>Scan with Telegram</h1>
            <img className="qr qr--big" src={data.qr_image} alt="Telegram login QR code" />
            <span className="hint" style={{ textAlign: "center" }}>
              <span className="dot dot--live" style={{ display: "inline-block", color: "var(--accent)", marginRight: 6 }} />
              Waiting for the scan… the code refreshes by itself.
            </span>
            <ol className="qr-steps">
              <li>On your phone, open <b>Telegram</b>.</li>
              <li>Go to <b>Settings</b> → <b>Devices</b>.</li>
              <li>Tap <b>Link Desktop Device</b> (or <b>Scan QR</b>) and point the camera at this code.</li>
            </ol>
          </>
        ) : data?.status === "done" ? (
          <>
            <h1 className="auth-title" style={{ textAlign: "center" }}>Done</h1>
            <Alert tone="ok">The account is linked. You can close this page.</Alert>
          </>
        ) : data ? (
          <>
            <h1 className="auth-title" style={{ textAlign: "center" }}>This QR code has closed</h1>
            <Alert>It was used, cancelled or expired. Go back to Add profile and start a new QR login for a fresh link.</Alert>
          </>
        ) : (
          <span className="hint" style={{ textAlign: "center" }}>Loading…</span>
        )}
        {failed && <Alert tone="bad">Can't reach the server. Retrying…</Alert>}
      </div>
    </div>
  );
}
