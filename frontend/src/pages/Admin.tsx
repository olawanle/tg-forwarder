import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "../components/GlassCard";
import { IconButton } from "../components/Small";
import { Button } from "../components/Button";
import { Field, Input } from "../components/Field";
import { SegmentedTabs, ToggleSwitch, AvatarBadge } from "../components/Small";
import { api, ApiError } from "../api/client";
import type { AdminUser } from "../api/types";

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
              <div style={{ display: "flex", gap: 8 }}>
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
    </div>
  );
}
