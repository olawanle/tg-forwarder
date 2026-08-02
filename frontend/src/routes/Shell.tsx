import { Outlet } from "react-router-dom";
import { BottomNav } from "../components/BottomNav";
import { Sidebar } from "../components/Sidebar";

/** Wraps the 5 primary nav pages (Home/Targets/Compose/Progress/Log). Below
 * 900px that's the floating pill nav (mobile thumb reach); at 900px+ it's a
 * persistent left sidebar instead (see components.css's .d-sidebar media
 * query) — CSS-driven, no JS breakpoint logic needed. */
export function Shell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
