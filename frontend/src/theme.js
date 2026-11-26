import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "clippulse-theme";

/** "system" | "light" | "dark" */
export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Theme preference with persistence; follows the OS setting while on "system". */
export function useTheme() {
  const [pref, setPref] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== "system" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setTheme = useCallback((next) => {
    setPref(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private windows); the choice still applies for this session.
    }
  }, []);

  // Derived from the preference (not read back from the DOM) so it is correct in the same render.
  const isDark = pref === "dark" || (pref === "system" && systemPrefersDark());
  return { pref, setTheme, isDark };
}
