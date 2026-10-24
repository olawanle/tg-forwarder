import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken } from "../api/client";
import type { TotpSetupConfirmResponse } from "../api/types";

interface AuthUser {
  userId: number;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  // Login is always two steps now (password, then a TOTP/backup code) --
  // there is no one-call `login()` anymore. The Login page drives the
  // /auth/login + /auth/login/totp (or /auth/totp/setup/confirm) calls
  // itself and hands the final result here once it has one.
  completeLogin: (res: TotpSetupConfirmResponse) => void;
  logout: () => void;
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "forwarder_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw) as AuthUser);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  function completeLogin(res: TotpSetupConfirmResponse) {
    setToken(res.token);
    const authUser: AuthUser = {
      userId: res.user_id,
      email: res.email,
      role: res.role,
      mustChangePassword: res.must_change_password,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }

  function logout() {
    // Best-effort: also end the session server-side so this token can't be
    // replayed. Still clear local state even if the request fails/is
    // already-expired — the user is logging out either way.
    api.post("/auth/logout").catch(() => {});
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("forwarder_active_profile");
    setUser(null);
  }

  function markPasswordChanged() {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, mustChangePassword: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ user, loading, completeLogin, logout, markPasswordChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
