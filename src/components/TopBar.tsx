"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import type { I18nKey } from "@/lib/i18n";

const TABS: { href: string; key: I18nKey; isActive: (p: string) => boolean }[] = [
  { href: "/chat", key: "tab.chat", isActive: (p) => p.startsWith("/chat") },
  {
    href: "/admin",
    key: "tab.admin",
    isActive: (p) => p.startsWith("/admin") && !p.startsWith("/admin/kb"),
  },
  { href: "/admin/kb", key: "tab.kb", isActive: (p) => p.startsWith("/admin/kb") },
];

export function TopBar() {
  const pathname = usePathname();
  const { t, tr, lang, setLang, toggleTheme, user, logout } = useApp();

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">AI</div>
        <div className="brand-name">{tr("সরকারি সেবা সহায়ক", "Government Service Assistant")}</div>
      </div>
      <nav className="tabs" aria-label={tr("প্রধান মেনু", "Main menu")}>
        {TABS.filter((tab) => tab.href === "/chat" || user).map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="tabbtn"
            aria-current={tab.isActive(pathname) ? "page" : undefined}
          >
            {t(tab.key)}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        <div className="langtoggle" role="group" aria-label={tr("ভাষা", "Language")}>
          <button type="button" aria-pressed={lang === "bn"} onClick={() => setLang("bn")}>
            বাংলা
          </button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
            English
          </button>
        </div>
        {user ? (
          <div className="usermenu">
            <span className="username" title={`${user.name} · ${user.title || user.role}`}>
              {user.name}
            </span>
            <button type="button" className="btn btn-outline" onClick={logout}>
              {tr("লগআউট", "Log out")}
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-outline">
            {tr("স্টাফ লগইন", "Staff login")}
          </Link>
        )}
        <button
          type="button"
          className="themetoggle"
          onClick={toggleTheme}
          aria-label={tr("থিম পরিবর্তন করুন", "Toggle theme")}
          title={tr("থিম পরিবর্তন করুন", "Toggle theme")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
