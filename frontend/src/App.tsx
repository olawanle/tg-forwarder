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
import { Targets } from "./pages/Targets";
import { Compose } from "./pages/Compose";
import { Progress } from "./pages/Progress";
import { Log } from "./pages/Log";

function RequirePasswordChange({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && !user.mustChangePassword) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
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
            <Route element={<Shell />}>
              <Route path="/home" element={<Home />} />
              <Route path="/compose" element={<Compose />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/targets" element={<Targets />} />
              <Route path="/log" element={<Log />} />
              <Route path="/profiles" element={<Profiles />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </ProfileProvider>
    </AuthProvider>
  );
}
