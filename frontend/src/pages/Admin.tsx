import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, Card, CardHead, Empty, Field, Input, PageHead, Pill, Sheet, SkeletonRows, Slider, Switch, Tabs } from "../components/ui";
import { api, ApiError } from "../api/client";
import type { AdminUser, AdminUserStats, AppSettings, JobDuration } from "../api/types";
import { fmtAgo, fmtDateTime, fmtDuration, parseServerTime } from "../lib/time";

export function Admin() {
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

  const [totpResetId, setTotpResetId] = useState<number | null>(null);
  const resetTotp = useMutation({
    mutationFn: (id: number) => api.post(`/admin/users/${id}/reset-totp`),
    onSuccess: (_data, id) => {
      setTotpResetId(id);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const setTotpExempt = useMutation({
    mutationFn: ({ id, exempt }: { id: number; exempt: boolean }) =>
      api.post(`/admin/users/${id}/totp-exempt`, { exempt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const appSettings = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => api.get<AppSettings>("/settings"),
  });
  const [defaultDelay, setDefaultDelay] = useState(3);
  const [delaySaveNotice, setDelaySaveNotice] = useState("");
  useEffect(() => {
    if (appSettings.data) setDefaultDelay(appSettings.data.default_delay_seconds);
  }, [appSettings.data]);
  const jobDurations = useQuery({
    queryKey: ["job-duration-diagnostics"],
    queryFn: () => api.get<JobDuration[]>("/admin/diagnostics/job-durations"),
  });

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

  const [delayEditUser, setDelayEditUser] = useState<AdminUser | null>(null);
  const [delayEditValue, setDelayEditValue] = useState(3);
  const setUserDelay = useMutation({
    mutationFn: ({ id, value }: { id: number; value: number | null }) =>
      api.patch(`/admin/users/${id}/default-delay`, { default_delay_seconds: value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setDelayEditUser(null);
    },
  });

  const users = usersQuery.data ?? [];

  return (
    <div className="page">
      <PageHead title="Admin" sub="Accounts, defaults and how recent broadcasts have been running." />

      <div className="grid grid--main">
        <div className="stack">
          <div className="spread">
            <span className="section-title">
              Users <span className="faint num">· {users.length}</span>
            </span>
          </div>

          {usersQuery.isLoading ? (
            <Card flush>
              <SkeletonRows count={5} />
            </Card>
          ) : (
            users.map((u) => (
              <Card key={u.id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                <div className="cluster" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <Avatar name={u.email} size={40} />
                  <div className="grow">
                    <div className="row-title">{u.email}</div>
                    <div className="row-sub">
                      {u.profile_count} profile{u.profile_count === 1 ? "" : "s"} ·{" "}
                      {u.default_delay_seconds !== null ? `${u.default_delay_seconds}s delay` : "default delay"} · joined{" "}
                      {fmtAgo(parseServerTime(u.created_at))}
                    </div>
                    <div className="row-sub">
                      {u.last_login_at
                        ? `Last login ${fmtAgo(parseServerTime(u.last_login_at))}${u.last_login_ip ? ` · ${u.last_login_ip}` : ""}`
                        : "Never logged in"}
                    </div>
                  </div>
                </div>
                <div className="cluster" style={{ marginTop: 12, gap: 6 }}>
                  <Pill tone={u.role === "admin" ? "accent" : "neutral"}>{u.role}</Pill>
                  <Pill tone={u.totp_exempt ? "warn" : u.totp_enabled ? "ok" : "neutral"}>
                    {u.totp_exempt ? "2FA exempt" : u.totp_enabled ? "2FA on" : "2FA not set up"}
                  </Pill>
                  {!u.is_active && <Pill tone="bad">Deactivated</Pill>}
                </div>
                {resetResult?.id === u.id && (
                  <div style={{ marginTop: 12 }}>
                    <Alert tone="ok">
                      New temporary password: <strong className="mono">{resetResult.password}</strong>
                    </Alert>
                  </div>
                )}
                {totpResetId === u.id && (
                  <div style={{ marginTop: 12 }}>
                    <Alert tone="ok">2FA reset. They'll set it up again on their next login.</Alert>
                  </div>
                )}
                <div className="btn-row" style={{ marginTop: 14 }}>
                  <Button size="sm" icon="chart" onClick={() => setStatsUser(u)}>
                    Stats
                  </Button>
                  <Button
                    size="sm"
                    icon="clock"
                    onClick={() => {
                      setDelayEditValue(u.default_delay_seconds ?? defaultDelay);
                      setDelayEditUser(u);
                    }}
                  >
                    Delay
                  </Button>
                  <Button size="sm" icon="key" onClick={() => handleReset(u)}>
                    Reset password
                  </Button>
                  {u.totp_enabled && !u.totp_exempt && (
                    <Button
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Reset 2FA for ${u.email}? They'll set it up again next login.`)) {
                          resetTotp.mutate(u.id);
                        }
                      }}
                    >
                      Reset 2FA
                    </Button>
                  )}
                  {u.totp_exempt ? (
                    <Button
                      size="sm"
                      disabled={setTotpExempt.isPending}
                      onClick={() => {
                        if (window.confirm(`Require 2FA again for ${u.email}? They'll set it up from scratch next login.`)) {
                          setTotpExempt.mutate({ id: u.id, exempt: false });
                        }
                      }}
                    >
                      Require 2FA again
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={setTotpExempt.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove the authenticator requirement for ${u.email}? They'll be able to log in with just their password — no 2FA at all — and stay logged in on multiple devices at once (normally a new login signs out every other device), until you require it again.`,
                          )
                        ) {
                          setTotpExempt.mutate({ id: u.id, exempt: true });
                        }
                      }}
                    >
                      Remove authenticator
                    </Button>
                  )}
                  <Button size="sm" variant={u.is_active ? "danger" : "primary"} onClick={() => setActive.mutate({ id: u.id, active: !u.is_active })}>
                    {u.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="stack">
          <Card>
            <CardHead title="Create a user" sub="The only way anyone gets an account." />
            <div className="stack">
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" />
              </Field>
              <Tabs
                value={role}
                onChange={setRole}
                options={[
                  { value: "user", label: "User" },
                  { value: "admin", label: "Admin" },
                ]}
              />
              <div className="setting">
                <div className="setting-title">Generate a temporary password</div>
                <Switch on={autoPassword} onChange={setAutoPassword} label="Generate a temporary password" />
              </div>
              {!autoPassword && (
                <Field label="Temporary password">
                  <Input type="password" value={manualPassword} onChange={(e) => setManualPassword(e.target.value)} />
                </Field>
              )}
              {error && <Alert tone="bad">{error}</Alert>}
              <Button
                variant="primary"
                icon="userPlus"
                block
                loading={createUser.isPending}
                onClick={() => {
                  setError("");
                  if (!email.trim()) {
                    setError("Email is required.");
                    return;
                  }
                  createUser.mutate();
                }}
              >
                {createUser.isPending ? "Creating…" : "Create user"}
              </Button>
              {tempPassword && (
                <Alert tone="ok">
                  Share this once with {tempPassword.email}. It won't be shown again.
                  <div className="mono" style={{ fontSize: 16, fontWeight: 600, marginTop: 4, color: "var(--text)" }}>
                    {tempPassword.password}
                  </div>
                </Alert>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Default send delay" sub="Where Compose starts for new broadcasts. Users can still change it each time." />
            <div className="stack">
              <Slider label="Default delay" value={defaultDelay} min={0} max={60} step={1} format={(v) => `${v}s`} onChange={setDefaultDelay} />
              {delaySaveNotice && <Alert tone="ok">{delaySaveNotice}</Alert>}
              <Button
                block
                loading={saveDefaultDelay.isPending}
                onClick={() => {
                  setDelaySaveNotice("");
                  saveDefaultDelay.mutate();
                }}
              >
                {saveDefaultDelay.isPending ? "Saving…" : "Save default"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card flush>
        <CardHead
          pad
          title="Recent broadcast durations"
          sub="Seconds per group rising with the delay unchanged points to Telegram throttling harder. Duration rising with it flat points to more groups."
        />
        {jobDurations.isLoading ? (
          <SkeletonRows count={4} />
        ) : (jobDurations.data ?? []).length === 0 ? (
          <Empty icon="clock" title="No completed broadcasts yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Profile</th>
                  <th>Finished</th>
                  <th className="right">Groups</th>
                  <th className="right">Delay</th>
                  <th className="right">Duration</th>
                  <th className="right">Sec / group</th>
                </tr>
              </thead>
              <tbody>
                {(jobDurations.data ?? []).map((j) => (
                  <tr key={j.id}>
                    <td className="mono">#{j.id}</td>
                    <td className="truncate" style={{ maxWidth: 180 }}>{j.profile_label}</td>
                    <td className="faint">{fmtDateTime(parseServerTime(j.updated_at))}</td>
                    <td className="right mono">{j.total}</td>
                    <td className="right mono">{j.delay_seconds}s</td>
                    <td className="right mono">{j.duration_seconds ? fmtDuration(j.duration_seconds) : "—"}</td>
                    <td className="right mono" style={{ fontWeight: 600 }}>{j.seconds_per_target ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {statsUser && (
        <Sheet onClose={() => setStatsUser(null)} wide>
          <div className="cluster" style={{ flexWrap: "nowrap" }}>
            <Avatar name={statsUser.email} size={42} />
            <div className="grow">
              <div className="sheet-title truncate" style={{ fontSize: 17 }}>{statsUser.email}</div>
              <div className="faint" style={{ fontSize: 12.5 }}>Activity across all profiles</div>
            </div>
          </div>

          {userStats.isLoading ? (
            <SkeletonRows count={3} />
          ) : userStats.data ? (
            <>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Card tight>
                  <div className="stat">
                    <span className="eyebrow">Sent</span>
                    <span className="stat-value" style={{ color: "var(--ok)" }}>{userStats.data.total_sent.toLocaleString()}</span>
                  </div>
                </Card>
                <Card tight>
                  <div className="stat">
                    <span className="eyebrow">Errors</span>
                    <span className="stat-value" style={{ color: userStats.data.total_errors ? "var(--bad)" : undefined }}>
                      {userStats.data.total_errors.toLocaleString()}
                    </span>
                  </div>
                </Card>
              </div>
              <div className="hint">
                {userStats.data.total_sent + userStats.data.total_errors > 0
                  ? `${((userStats.data.total_sent / (userStats.data.total_sent + userStats.data.total_errors)) * 100).toFixed(1)}% delivered · `
                  : ""}
                Last activity {userStats.data.last_activity ? fmtAgo(parseServerTime(userStats.data.last_activity)) : "never"}
              </div>

              <div className="eyebrow">Per profile</div>
              {userStats.data.profiles.length === 0 ? (
                <div className="hint">No profiles yet.</div>
              ) : (
                <Card flush>
                  <div className="rows">
                    {userStats.data.profiles.map((p) => (
                      <div className="row row--tight" key={p.id}>
                        <Avatar name={p.label} size={32} />
                        <div className="row-main">
                          <div className="row-title">{p.label}</div>
                          <div className="row-sub">
                            {p.phone ? `${p.phone} · ` : ""}
                            {p.last_activity ? fmtAgo(parseServerTime(p.last_activity)) : "no activity yet"}
                          </div>
                        </div>
                        <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                          <span style={{ color: "var(--ok)" }}>{p.sent}</span>
                          {p.errors > 0 && <span style={{ color: "var(--bad)" }}> / {p.errors}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="eyebrow">Logins</div>
              {userStats.data.distinct_login_ips_7d > 2 && (
                <Alert tone="bad">
                  {userStats.data.distinct_login_ips_7d} different IPs in the last 7 days. Worth checking this account isn't being shared.
                </Alert>
              )}
              {userStats.data.recent_logins.length === 0 ? (
                <div className="hint">No login history yet.</div>
              ) : (
                <Card flush>
                  <div className="rows">
                    {userStats.data.recent_logins.map((l, i) => (
                      <div className="row row--tight" key={i} style={{ minHeight: 40 }}>
                        <Pill tone={l.success ? "ok" : "bad"}>{l.success ? "OK" : "Failed"}</Pill>
                        <div className="row-main">
                          <div className="row-sub" style={{ color: "var(--text-2)" }}>
                            {l.stage}
                            {l.detail ? ` (${l.detail})` : ""}
                          </div>
                        </div>
                        <span className="row-time">
                          {fmtDateTime(parseServerTime(l.at))}
                          {l.ip ? ` · ${l.ip}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : (
            <Alert tone="bad">Could not load stats.</Alert>
          )}
        </Sheet>
      )}

      {delayEditUser && (
        <Sheet onClose={() => setDelayEditUser(null)}>
          <div className="cluster" style={{ flexWrap: "nowrap" }}>
            <Avatar name={delayEditUser.email} size={42} />
            <div className="grow">
              <div className="sheet-title truncate" style={{ fontSize: 17 }}>{delayEditUser.email}</div>
              <div className="faint" style={{ fontSize: 12.5 }}>
                {delayEditUser.default_delay_seconds !== null
                  ? `Currently overridden at ${delayEditUser.default_delay_seconds}s`
                  : `Currently using the app default (${defaultDelay}s)`}
              </div>
            </div>
          </div>
          <Slider label="This user's default delay" value={delayEditValue} min={0} max={60} step={1} format={(v) => `${v}s`} onChange={setDelayEditValue} />
          <div className="btn-row">
            {delayEditUser.default_delay_seconds !== null && (
              <Button className="grow" onClick={() => setUserDelay.mutate({ id: delayEditUser.id, value: null })} disabled={setUserDelay.isPending}>
                Use app default
              </Button>
            )}
            <Button variant="primary" className="grow" onClick={() => setUserDelay.mutate({ id: delayEditUser.id, value: delayEditValue })} loading={setUserDelay.isPending}>
              {setUserDelay.isPending ? "Saving…" : "Save for this user"}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
