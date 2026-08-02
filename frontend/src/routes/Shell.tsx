import { Outlet } from "react-router-dom";
import { BottomNav } from "../components/BottomNav";

/** Wraps the 5 primary nav pages (Home/Targets/Compose/Progress/Log) with the
 * floating pill nav — Profiles and Admin are reached via Home and don't show it,
 * matching the design's `showNav = navNames.includes(screen)` rule. */
export function Shell() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
