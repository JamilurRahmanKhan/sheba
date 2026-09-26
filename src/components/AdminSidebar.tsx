"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { bn } from "@/lib/conversations";
import { useSettings } from "@/lib/hooks";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const LINKS = [
  { href: "/admin", label: "ড্যাশবোর্ড" },
  { href: "/admin/conversations", label: "কথোপকথন লগ" },
  { href: "/admin/kb", label: "নলেজ বেস" },
  { href: "/admin/escalations", label: "হস্তান্তরকৃত প্রশ্ন" },
  { href: "/admin/settings", label: "সেটিংস" },
];

interface Alerts {
  newCount: number;
  overdueCount: number;
  latest: { id: string; question: string } | null;
}

const PREF_KEY = "seba.alerts";

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio may be blocked until the user interacts with the page */
  }
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { data } = useSettings();
  const org = (data?.settings ?? DEFAULT_SETTINGS).org;

  const [sound, setSound] = useState(true);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("unsupported");
  const [toast, setToast] = useState<{ id: string; question: string } | null>(null);
  const prev = useRef<number | null>(null);
  const soundRef = useRef(true);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of browser preferences */
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || "{}") as { sound?: boolean };
      if (p.sound === false) {
        setSound(false);
        soundRef.current = false;
      }
    } catch {
      /* ignore */
    }
    setNotifPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const { data: alerts } = useSWR<Alerts>("/api/admin/alerts", fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    onSuccess: (a) => {
      // Alert only when the count of waiting cases goes UP after the first load.
      if (prev.current !== null && a.newCount > prev.current && a.latest) {
        setToast(a.latest);
        if (soundRef.current) beep();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("নতুন হস্তান্তর এসেছে", { body: a.latest.question, tag: "seba-new-case" });
          } catch {
            /* some browsers only allow notifications from a service worker */
          }
        }
      }
      prev.current = a.newCount;
    },
  });
  const newCount = alerts?.newCount ?? 0;

  // Tab title shows the number of waiting cases, e.g. "(2) হস্তান্তরকৃত প্রশ্ন · …"
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = newCount > 0 ? `(${newCount}) ${base}` : base;
    };
    apply();
    const t = setTimeout(apply, 400); // after Next.js updates the title on navigation
    return () => clearTimeout(t);
  }, [newCount, pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <aside className="shell-side">
      <div className="side-title">{org.panelTitle}</div>
      <div className="side-sub">{org.departmentName}</div>
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        const badge = l.href === "/admin/escalations" && newCount > 0 ? newCount : 0;
        return (
          <Link key={l.href} href={l.href} className="side-link" aria-current={active ? "page" : undefined}>
            <span className="dot" />
            {l.label}
            {badge > 0 && (
              <span className="side-badge" aria-label={`${bn(badge)}টি নতুন${alerts?.overdueCount ? `, ${bn(alerts.overdueCount)}টি SLA ছাড়িয়েছে` : ""}`}>
                {bn(badge)}
              </span>
            )}
          </Link>
        );
      })}

      <div className="side-tools">
        <button
          type="button"
          className="side-tool"
          aria-pressed={sound}
          onClick={() => {
            const next = !sound;
            setSound(next);
            soundRef.current = next;
            try {
              localStorage.setItem(PREF_KEY, JSON.stringify({ sound: next }));
            } catch {
              /* best effort */
            }
            if (next) beep();
          }}
        >
          নতুন কেসের শব্দ: {sound ? "চালু" : "বন্ধ"}
        </button>
        {notifPerm === "default" && (
          <button type="button" className="side-tool" onClick={async () => setNotifPerm(await Notification.requestPermission())}>
            ডেস্কটপ নোটিফিকেশন চালু করুন
          </button>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          <strong>নতুন হস্তান্তর:</strong> {toast.question.slice(0, 90)}{" "}
          <Link href={`/admin/escalations?open=${toast.id}`} onClick={() => setToast(null)}>
            খুলুন →
          </Link>
        </div>
      )}
    </aside>
  );
}
