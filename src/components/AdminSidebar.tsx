"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "@/lib/hooks";
import { DEFAULT_SETTINGS } from "@/lib/settings";

const LINKS = [
  { href: "/admin", label: "ড্যাশবোর্ড" },
  { href: "/admin/conversations", label: "কথোপকথন লগ" },
  { href: "/admin/kb", label: "নলেজ বেস" },
  { href: "/admin/escalations", label: "হস্তান্তরকৃত প্রশ্ন" },
  { href: "/admin/settings", label: "সেটিংস" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { data } = useSettings();
  const org = (data?.settings ?? DEFAULT_SETTINGS).org;
  return (
    <aside className="shell-side">
      <div className="side-title">{org.panelTitle}</div>
      <div className="side-sub">{org.departmentName}</div>
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className="side-link" aria-current={active ? "page" : undefined}>
            <span className="dot" />
            {l.label}
          </Link>
        );
      })}
    </aside>
  );
}
