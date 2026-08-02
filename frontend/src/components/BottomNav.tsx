import { NavLink } from "react-router-dom";

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

export function BottomNav() {
  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav">
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {({ isActive }) => (
              <>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isActive ? 2.3 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: ICONS[item.label] }}
                />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
