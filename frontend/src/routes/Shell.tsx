import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { Avatar, Pill, Sheet } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { useProfiles } from "../profile/ProfileContext";
import { jobCounts, useEta, useLiveJob } from "../lib/jobs";
import { fmtDuration } from "../lib/time";
import { ACCENTS, BRAND_TAGLINE, useAccent } from "../theme/accent";
import type { Job } from "../api/types";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/home", label: "Dashboard", icon: "home" },
  { to: "/compose", label: "Compose", icon: "send" },
  { to: "/progress", label: "Progress", icon: "progress" },
  { to: "/targets", label: "Targets", icon: "target" },
  { to: "/log", label: "Send log", icon: "list" },
];

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark ${large ? "brand-mark--lg" : ""}`}>
      <Icon name="send" size={large ? 24 : 17} strokeWidth={2.1} />
    </span>
  );
}

function AccentPicker() {
  const { accent, setAccent } = useAccent();
  return (
    <div className="swatches" role="group" aria-label="Accent colour">
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          className="swatch"
          style={{ "--sw": a.color } as React.CSSProperties}
          aria-pressed={accent === a.id}
          aria-label={a.label}
          title={a.label}
          onClick={() => setAccent(a.id)}
        />
      ))}
    </div>
  );
}

/** Wraps every signed-in screen: a sidebar from laptop width up, a top bar
 * and floating tab bar on phones. Purely CSS-driven -- one tree, no
 * duplicated mobile/desktop markup. */
export function Shell() {
  const { user, logout } = useAuth();
  const { profiles, activeProfile, setActiveProfileId } = useProfiles();
  const location = useLocation();
  const navigate = useNavigate();
  const { job, running, fetchedAt } = useLiveJob(activeProfile?.id);
  const eta = useEta(job, fetchedAt);

  const [userMenu, setUserMenu] = useState(false);
  const [profileSheet, setProfileSheet] = useState(false);
  const [accountSheet, setAccountSheet] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setUserMenu(false);
    setProfileSheet(false);
    setAccountSheet(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [userMenu]);

  const isAdmin = user?.role === "admin";
  const liveJob: Job | null = running ? job : null;
  const counts = liveJob ? jobCounts(liveJob) : null;

  const profileList = (onPick: () => void) =>
    profiles.map((p) => (
      <button
        key={p.id}
        type="button"
        className={`profile-item ${p.id === activeProfile?.id ? "active" : ""}`}
        onClick={() => {
          setActiveProfileId(p.id);
          onPick();
        }}
      >
        <Avatar name={p.label} size={30} />
        <span className="grow">
          <span className="profile-item-name truncate" style={{ display: "block" }}>
            {p.label}
          </span>
          <span className="profile-item-sub">
            <span className="dot" style={{ width: 6, height: 6, color: p.has_session ? "var(--ok)" : "var(--bad)" }} />
            {p.has_session ? "Connected" : "No session"}
          </span>
        </span>
        {p.id === activeProfile?.id && <Icon name="check" size={15} className="faint" />}
      </button>
    ));

  return (
    <div className="shell">
      {/* ------------------------------------------------ desktop sidebar */}
      <aside className="sidebar">
        <Link to="/home" className="brand">
          <BrandMark />
          <span>
            <span className="brand-name" style={{ display: "block" }}>
              Forwarder
            </span>
            <span className="brand-tag">{BRAND_TAGLINE}</span>
          </span>
        </Link>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon name={item.icon} size={17} />
              {item.label}
              {item.to === "/progress" && counts && (
                <Pill tone="accent" live mono>
                  {counts.done}/{counts.total || "…"}
                </Pill>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="side-label">
          <span className="eyebrow">Profiles</span>
          <Link to="/profiles" className="link">
            Manage
          </Link>
        </div>
        <div className="nav">
          {profileList(() => undefined)}
          {profiles.length === 0 && (
            <Link to="/profiles" className="nav-item">
              <Icon name="plus" size={17} />
              Add a Telegram profile
            </Link>
          )}
        </div>

        <div className="side-foot" ref={menuRef}>
          {userMenu && (
            <div className="menu user-menu">
              {isAdmin && (
                <button type="button" className="menu-item" onClick={() => navigate("/admin")}>
                  <Icon name="shield" size={16} />
                  Admin console
                </button>
              )}
              <button type="button" className="menu-item" onClick={() => navigate("/profiles")}>
                <Icon name="users" size={16} />
                Manage profiles
              </button>
              <div className="menu-sep" />
              <div className="menu-label eyebrow">Accent</div>
              <AccentPicker />
              <div className="menu-sep" />
              <button type="button" className="menu-item menu-item--danger" onClick={logout}>
                <Icon name="logout" size={16} />
                Log out
              </button>
            </div>
          )}
          <button type="button" className="user-chip" onClick={() => setUserMenu((v) => !v)} aria-expanded={userMenu}>
            <Avatar name={user?.email ?? "?"} size={32} />
            <span className="grow">
              <span className="profile-item-name truncate" style={{ display: "block" }}>
                {user?.email}
              </span>
              <span className="profile-item-sub" style={{ textTransform: "capitalize" }}>
                {user?.role}
              </span>
            </span>
            <Icon name="chevronsUpDown" size={15} />
          </button>
        </div>
      </aside>

      {/* -------------------------------------------------- phone top bar */}
      <header className="topbar">
        <button type="button" className="profile-chip" onClick={() => setProfileSheet(true)}>
          <Avatar name={activeProfile?.label ?? "?"} size={28} />
          <span className="truncate">{activeProfile?.label ?? "No profile"}</span>
          <Icon name="chevronDown" size={15} />
        </button>
        <div className="topbar-end">
          {liveJob && counts && location.pathname !== "/progress" && (
            <Link to="/progress" className="live-pill">
              <span className="dot dot--live" />
              <span className="mono">
                {counts.done}/{counts.total || "…"}
              </span>
              {eta && (
                <>
                  <span className="sep">·</span>
                  <span className="mono">{fmtDuration(eta.secondsLeft)}</span>
                </>
              )}
            </Link>
          )}
          <button type="button" className="icon-btn" aria-label="Account" onClick={() => setAccountSheet(true)}>
            <Icon name="sliders" size={17} />
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      {/* -------------------------------------------------- phone tab bar */}
      <div className="tabbar-wrap">
        <nav className="tabbar">
          <NavLink to="/home" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon name="home" size={21} />
            Home
          </NavLink>
          <NavLink to="/targets" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon name="target" size={21} />
            Targets
          </NavLink>
          <NavLink to="/compose" className={({ isActive }) => `tab tab--compose ${isActive ? "active" : ""}`} aria-label="Compose">
            <span className="fab">
              <Icon name="send" size={20} strokeWidth={2.1} />
            </span>
          </NavLink>
          <NavLink to="/progress" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon name="progress" size={21} />
            Progress
            {liveJob && <span className="tab-live" />}
          </NavLink>
          <NavLink to="/log" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon name="list" size={21} />
            Log
          </NavLink>
        </nav>
      </div>

      {profileSheet && (
        <Sheet onClose={() => setProfileSheet(false)}>
          <div>
            <div className="sheet-title">Switch profile</div>
            <div className="sheet-sub">Each profile is one Telegram account.</div>
          </div>
          <div className="nav">{profileList(() => setProfileSheet(false))}</div>
          <Link to="/profiles" className="btn btn--block">
            <Icon name="users" size={17} />
            Manage profiles
          </Link>
        </Sheet>
      )}

      {accountSheet && (
        <Sheet onClose={() => setAccountSheet(false)}>
          <div className="cluster" style={{ flexWrap: "nowrap" }}>
            <Avatar name={user?.email ?? "?"} size={42} />
            <div className="grow">
              <div className="sheet-title truncate" style={{ fontSize: 16 }}>
                {user?.email}
              </div>
              <div className="faint" style={{ fontSize: 12.5, textTransform: "capitalize" }}>
                {user?.role}
              </div>
            </div>
          </div>
          <div className="nav">
            {isAdmin && (
              <Link to="/admin" className="nav-item">
                <Icon name="shield" size={17} />
                Admin console
                <Icon name="chevronRight" size={15} className="faint" />
              </Link>
            )}
            <Link to="/profiles" className="nav-item">
              <Icon name="users" size={17} />
              Manage profiles
            </Link>
          </div>
          <div>
            <div className="eyebrow" style={{ padding: "0 10px 10px" }}>
              Accent
            </div>
            <AccentPicker />
          </div>
          <button type="button" className="btn btn--danger btn--block" onClick={logout}>
            <Icon name="logout" size={17} />
            Log out
          </button>
        </Sheet>
      )}
    </div>
  );
}
