import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { IconButton } from "../components/Small";
import { Button } from "../components/Button";
import { Field, Input } from "../components/Field";
import { SegmentedTabs, ToggleSwitch, AvatarBadge } from "../components/Small";
import { BottomSheet } from "../components/BottomSheet";
import { Slider } from "../components/Slider";
import { api, ApiError } from "../api/client";
import type { AdminUser, AdminUserStats, AppSettings } from "../api/types";

export function Admin() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [autoPassword, setAutoPassword] = useState(true);
  const [manualPassword, setManualPassword] = useState("");
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users"),
  });

  const createUser = useMutation({
    mutationFn: () =>
      api.post<{ user_id: number; temp_password: string }>("/admin/users", {
        email: email.trim().toLowerCase(),
        role,
        password: autoPassword ? null : manualPassword,
      }),
    onSuccess: (res) => {
      setTempPassword({ email: email.trim().toLowerCase(), password: res.temp_password });
      setEmail("");
      setManualPassword("");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not create user."),
  });

  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.patch(`/admin/users/${id}/active`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const [resetResult, setResetResult] = useState<{ id: number; email: string; password: string } | null>(null);
  const resetPassword = useMutation({
    mutationFn: (id: number) =>
      api.post<{ temp_password: string }>(`/admin/users/${id}/reset-password`),
  });

  async function handleReset(user: AdminUser) {
    try {
      const res = await resetPassword.mutateAsync(user.id);
      setResetResult({ id: user.id, email: user.email, password: res.temp_password });
    } catch {
      // surfaced via mutation state below if needed
    }
  }

  const appSettings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<AppSettings>("/settings"),
  });
  const [defaultDelay, setDefaultDelay] = useState(3);
  const [delaySaveNotice, setDelaySaveNotice] = useState("");
  useEffect(() => {
    if (appSettings.data) setDefaultDelay(appSettings.data.default_delay_seconds);
  }, [appSettings.data]);
  const saveDefaultDelay = useMutation({
    mutationFn: () => api.put<AppSettings>("/admin/settings", { default_delay_seconds: defaultDelay }),
    onSuccess: () => {
      setDelaySaveNotice("Saved — new broadcasts will start with this delay.");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: () => setDelaySaveNotice("Could not save."),
  });

  const [statsUser, setStatsUser] = useState<AdminUser | null>(null);
  const userStats = useQuery({
    queryKey: ["admin-user-stats", statsUser?.id],
    queryFn: () => api.get<AdminUserStats>(`/admin/users/${statsUser!.id}/stats`),
    enabled: !!statsUser,
  });

  return (
    <div className="page page--no-nav">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 className="page-title">Admin</h1>
          <div className="page-subtitle">The only way anyone gets an account.</div>
        </div>
        <IconButton ariaLabel="Back" onClick={() => navigate("/profiles")}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </IconButton>
      </div>

      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>Default send delay</div>
            <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 3, lineHeight: 1.4 }}>
              What Compose starts new broadcasts at. Users can still change it per-broadcast — this
              just sets the starting point, down to 0s for anyone who doesn't want the 3s default.
            </div>
          </div>
          <Slider label="Default delay" value={defaultDelay} min={0} max={60} step={1} suffix="s" onChange={setDefaultDelay} />
          {delaySaveNotice && (
            <div style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}>{delaySaveNotice}</div>
          )}
          <Button
            variant="outline"
            small
            onClick={() => {
              setDelaySaveNotice("");
              saveDefaultDelay.mutate();
            }}
            disabled={saveDefaultDelay.isPending}
          >
            {saveDefaultDelay.isPending ? "Saving…" : "Save default"}
          </Button>
        </div>
      </GlassCard>

      <GlassCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>Create a user</div>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
            />
          </Field>
          <SegmentedTabs
            value={role}
            onChange={setRole}
            options={[
              { value: "user", label: "user" },
              { value: "admin", label: "admin" },
            ]}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Generate a temporary password</span>
            <ToggleSwitch on={autoPassword} onChange={setAutoPassword} />
          </div>
          {!autoPassword && (
            <Field label="Temporary password">
              <Input
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
              />
            </Field>
          )}
          {error && <div style={{ color: "var(--bad)", fontSize: 13 }}>{error}</div>}
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              if (!email.trim()) {
                setError("Email is required.");
                return;
              }
              createUser.mutate();
            }}
            disabled={createUser.isPending}
          >
            {createUser.isPending ? "Creating…" : "Create user"}
          </Button>
          {tempPassword && (
            <div style={{ background: "var(--ok-soft)", borderRadius: 18, padding: "13px 14px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text2)" }}>
                Share this once for {tempPassword.email} — it won't be shown again
              </div>
              <div style={{ fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                {tempPassword.password}
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", padding: "4px 4px 0" }}>
        Users · {usersQuery.data?.length ?? 0}
      </div>

      {usersQuery.isLoading ? (
        <GlassCard>Loading…</GlassCard>
      ) : (
        (usersQuery.data ?? []).map((u) => (
          <GlassCard key={u.id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <AvatarBadge seed={u.email} size={42} fontSize={14} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.email}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    {u.profile_count} profile{u.profile_count === 1 ? "" : "s"} · {u.created_at.slice(0, 10)}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: u.role === "admin" ? "var(--accent-soft)" : "var(--glass-2)",
                    color: u.role === "admin" ? "var(--accent)" : "var(--text2)",
                  }}
                >
                  {u.role}
                </span>
              </div>
              {resetResult?.id === u.id && (
                <div style={{ background: "var(--ok-soft)", borderRadius: 14, padding: "10px 12px", fontSize: 12.5 }}>
                  New temp password: <strong style={{ fontFamily: "ui-monospace, monospace" }}>{resetResult.password}</strong>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="outline" small onClick={() => setStatsUser(u)}>
                  View stats
                </Button>
                <Button variant="outline" small onClick={() => handleReset(u)}>
                  Reset password
                </Button>
                <Button
                  variant={u.is_active ? "danger" : "primary"}
                  small
                  onClick={() => setActive.mutate({ id: u.id, active: !u.is_active })}
                >
                  {u.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </div>
          </GlassCard>
        ))
      )}

      {statsUser && (
        <BottomSheet onClose={() => setStatsUser(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <AvatarBadge seed={statsUser.email} size={40} fontSize={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {statsUser.email}
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>Activity across all profiles</div>
            </div>
          </div>

          {userStats.isLoading ? (
            <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>Loading…</div>
          ) : userStats.data ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="glass-card--soft" style={{ border: "1px solid var(--stroke)" }}>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--ok)" }}>
                    {userStats.data.total_sent}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text2)", fontWeight: 600, marginTop: 2 }}>Sent</div>
                </div>
                <div className="glass-card--soft" style={{ border: "1px solid var(--stroke)" }}>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--bad)" }}>
                    {userStats.data.total_errors}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text2)", fontWeight: 600, marginTop: 2 }}>Errors</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", padding: "0 2px" }}>
                {userStats.data.total_sent + userStats.data.total_errors > 0
                  ? `${((userStats.data.total_sent / (userStats.data.total_sent + userStats.data.total_errors)) * 100).toFixed(1)}% success · `
                  : ""}
                Last activity: {userStats.data.last_activity ? userStats.data.last_activity.slice(0, 16).replace("T", " ") : "never"}
              </div>

              <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 2px 0" }}>
                Per profile
              </div>
              {userStats.data.profiles.length === 0 ? (
                <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: "10px 0" }}>No profiles yet.</div>
              ) : (
                userStats.data.profiles.map((p) => (
                  <div key={p.id} className="glass-card--soft" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <AvatarBadge seed={p.label} size={32} fontSize={12} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 1 }}>
                        {p.last_activity ? p.last_activity.slice(0, 16).replace("T", " ") : "no activity yet"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 800 }}>
                        <span style={{ color: "var(--ok)" }}>{p.sent}</span>
                        {p.errors > 0 && <span style={{ color: "var(--bad)" }}> / {p.errors}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700 }}>sent{p.errors > 0 ? " / errors" : ""}</div>
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <div style={{ color: "var(--bad)", fontSize: 13, textAlign: "center", padding: "16px 0" }}>Could not load stats.</div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
