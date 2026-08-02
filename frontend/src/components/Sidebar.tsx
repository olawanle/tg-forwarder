import { Link, NavLink } from "react-router-dom";
import { AvatarBadge } from "./Small";
import { useProfiles } from "../profile/ProfileContext";

const ICONS: Record<string, string> = {
  Home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z"/><path d="M9.5 20.5v-5a2.5 2.5 0 0 1 5 0v5"/>',
  Targets: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  Compose: '<path d="M21.5 2.5 14 21l-3.2-7.8L3 10Z"/><path d="M21.5 2.5 10.8 13.2"/>',
  Progress: '<path d="M20.5 12a8.5 8.5 0 1 1-4.3-7.4"/><path d="M12 7.5V12l3 2"/>',
  Log: '<path d="M4 6.5h11M4 12h16M4 17.5h8"/><circle cx="19" cy="6.5" r="1.6"/><circle cx="16" cy="17.5" r="1.6"/>',
};

const ITEMS = [
  { to: "/home", label: "Home" },
  { to: "/targets", label: "Targets" },
  { to: "/compose", label: "Compose" },
  { to: "/progress", label: "Progress" },
  { to: "/log", label: "Log" },
];

export function Sidebar() {
  const { activeProfile } = useProfiles();

  return (
    <aside className="d-sidebar">
      <Link to="/home" className="d-brand" style={{ textDecoration: "none", color: "var(--text)" }}>
        <span className="mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M21.5 3 2.5 10.5c-1.2.47-1.2 1.13-.22 1.43l4.9 1.53 11.35-7.16c.53-.33 1.02-.15.62.21L9.9 15.05h-.01l.01.01-.35 5.06c.5 0 .72-.23.99-.5l2.4-2.33 4.98 3.68c.92.51 1.58.25 1.81-.85l3.28-15.5c.33-1.35-.5-1.96-1.5-1.62Z"
              fill="#fff"
            />
          </svg>
        </span>
        <b>Forwarder</b>
      </Link>

      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `d-nav-item ${isActive ? "active" : ""}`}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: ICONS[item.label] }}
          />
          {item.label}
        </NavLink>
      ))}

      <div className="spacer" />

      <Link to="/profiles" className="d-profile-card">
        <AvatarBadge seed={activeProfile?.label || "?"} size={32} fontSize={12} />
        <div>
          <div className="name">{activeProfile?.label || "No profile"}</div>
          <div className="sub mono">{activeProfile?.has_session ? "CONNECTED" : "NO SESSION"}</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Link>
    </aside>
  );
}
