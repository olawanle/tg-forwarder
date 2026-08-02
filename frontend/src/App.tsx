import { useEffect } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProfileProvider } from "./profile/ProfileContext";
import { RequireAuth } from "./routes/RequireAuth";
import { Shell } from "./routes/Shell";
import { Login } from "./pages/Login";
import { SetPassword } from "./pages/SetPassword";
import { Home } from "./pages/Home";
import { Profiles } from "./pages/Profiles";
import { Admin } from "./pages/Admin";
import { PageStub } from "./pages/PageStub";

const THEME_KEY = "forwarder_theme";

function useThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);
}

function RequirePasswordChange({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && !user.mustChangePassword) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function AppBackground() {
  return (
    <div className="app-blobs">
      <div className="b1" />
      <div className="b2" />
      <div className="b3" />
    </div>
  );
}

export default function App() {
  useThemeInit();

  return (
    <AuthProvider>
      <ProfileProvider>
        <div className="app-bg">
          <AppBackground />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/set-password"
              element={
                <RequirePasswordChange>
                  <SetPassword />
                </RequirePasswordChange>
              }
            />

            <Route element={<RequireAuth />}>
              <Route path="/profiles" element={<Profiles />} />
              <Route path="/admin" element={<Admin />} />

              <Route element={<Shell />}>
                <Route path="/home" element={<Home />} />
                <Route
                  path="/targets"
                  element={<PageStub title="Targets" subtitle="Groups, blacklist, Discord." />}
                />
                <Route
                  path="/compose"
                  element={<PageStub title="Compose" subtitle="Write and broadcast." />}
                />
                <Route
                  path="/progress"
                  element={<PageStub title="Progress" subtitle="Live job status." />}
                />
                <Route path="/log" element={<PageStub title="Log" subtitle="Send history." />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </ProfileProvider>
    </AuthProvider>
  );
}
