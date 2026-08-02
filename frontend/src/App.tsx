import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProfileProvider } from "./profile/ProfileContext";
import { RequireAuth } from "./routes/RequireAuth";
import { Shell } from "./routes/Shell";
import { useThemeInit } from "./theme/useTheme";
import { Login } from "./pages/Login";
import { SetPassword } from "./pages/SetPassword";
import { Home } from "./pages/Home";
import { Profiles } from "./pages/Profiles";
import { Admin } from "./pages/Admin";
import { Targets } from "./pages/Targets";
import { Compose } from "./pages/Compose";
import { Progress } from "./pages/Progress";
import { Log } from "./pages/Log";

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
                <Route path="/targets" element={<Targets />} />
                <Route path="/compose" element={<Compose />} />
                <Route path="/progress" element={<Progress />} />
                <Route path="/log" element={<Log />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </div>
      </ProfileProvider>
    </AuthProvider>
  );
}
