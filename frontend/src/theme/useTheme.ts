import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "forwarder_theme";
type Theme = "light" | "dark";

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") apply(saved);
  }, []);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return systemPrefersDark() ? "dark" : "light";
  });

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_KEY, next);
    apply(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
