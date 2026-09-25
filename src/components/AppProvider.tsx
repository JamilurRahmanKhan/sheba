"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translate, type I18nKey, type Lang } from "@/lib/i18n";
import type { SessionUser } from "@/lib/settings";
import { api } from "@/lib/api";

export type Theme = "" | "light" | "dark";

const PREFS_KEY = "seba.prefs";

interface AppContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey) => string;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  /** null when nobody is signed in (public chat visitors) */
  user: SessionUser | null;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Holds only per-browser preferences (language, theme) and the signed-in user.
 * All business data (conversations, cases, knowledge base, settings) now lives in MongoDB behind /api.
 */
export function AppProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("bn");
  const [theme, setTheme] = useState<Theme>("");

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as { lang?: Lang; theme?: Theme };
      /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration of browser preferences */
      if (p.lang === "en") setLang("en");
      if (p.theme === "light" || p.theme === "dark") setTheme(p.theme);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    root.lang = lang;
  }, [theme, lang]);

  const persist = useCallback((next: { lang?: Lang; theme?: Theme }) => {
    try {
      const cur = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      localStorage.setItem(PREFS_KEY, JSON.stringify({ ...cur, ...next }));
    } catch {
      /* best effort */
    }
  }, []);

  const setLangP = useCallback((l: Lang) => {
    setLang(l);
    persist({ lang: l });
  }, [persist]);

  const setThemeP = useCallback((th: Theme) => {
    setTheme(th);
    persist({ theme: th });
  }, [persist]);

  const toggleTheme = useCallback(() => {
    const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const next: Theme = !theme ? (sysDark ? "light" : "dark") : theme === "dark" ? "light" : "dark";
    setThemeP(next);
  }, [theme, setThemeP]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
    } finally {
      // Full navigation on purpose so the server layout re-reads the (cleared) session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    }
  }, []);

  const t = useCallback((key: I18nKey) => translate(lang, key), [lang]);

  const value = useMemo<AppContextValue>(
    () => ({ lang, setLang: setLangP, t, theme, setTheme: setThemeP, toggleTheme, user, logout }),
    [lang, setLangP, t, theme, setThemeP, toggleTheme, user, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
