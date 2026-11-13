import { useCallback, useState } from "react";

/** Accent presets; the palettes themselves live in styles/tokens.css. */
export const ACCENTS = [
  { id: "emerald", label: "Emerald", color: "#2fe0a0" },
  { id: "blue", label: "Blue", color: "#5b9dff" },
  { id: "violet", label: "Violet", color: "#9d8cff" },
  { id: "amber", label: "Amber", color: "#ffb547" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

const KEY = "forwarder_accent";

function isAccent(value: unknown): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

/** The deployment's default (VITE_ACCENT at build time), unless this
 * browser has picked its own. */
function stored(): AccentId {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Private mode etc. -- fall through to the default.
  }
  if (isAccent(saved)) return saved;
  const fromEnv = import.meta.env.VITE_ACCENT as string | undefined;
  return isAccent(fromEnv) ? fromEnv : "emerald";
}

function apply(accent: AccentId): void {
  document.documentElement.setAttribute("data-accent", accent);
}

/** Call once before first paint so the right accent is there from frame one. */
export function initAccent(): void {
  apply(stored());
}

export function useAccent() {
  const [accent, setAccentState] = useState<AccentId>(stored);
  const setAccent = useCallback((next: AccentId) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Still applies for this visit.
    }
    apply(next);
    setAccentState(next);
  }, []);
  return { accent, setAccent };
}

/** Line under the product name. A deployment can set its own. */
export const BRAND_TAGLINE = (import.meta.env.VITE_BRAND_TAGLINE as string | undefined) || "Broadcast console";
