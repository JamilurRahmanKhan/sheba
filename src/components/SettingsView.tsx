"use client";

import { useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { useApp, type Theme } from "./AppProvider";
import { Modal } from "./Modal";
import { api, errorMessage, fetcher } from "@/lib/api";
import { useSettings, useTeam } from "@/lib/hooks";
import { bn } from "@/lib/conversations";
import { DEFAULT_SETTINGS, WEEKDAYS, hoursSummary, validateSettings, withinWorkingHours, type Role, type Settings, type SettingsErrors } from "@/lib/settings";

type TabId = "general" | "handoff" | "bot" | "team" | "data";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "সাধারণ" },
  { id: "handoff", label: "হস্তান্তর ও সময়সূচি" },
  { id: "bot", label: "বট" },
  { id: "team", label: "টিম" },
  { id: "data", label: "ডেটা ও গোপনীয়তা" },
];

const TAB_OF_ERROR: Record<keyof SettingsErrors, TabId> = {
  panelTitle: "general",
  departmentName: "general",
  slaMinutes: "handoff",
  hours: "handoff",
  offHoursMessage: "handoff",
  greeting: "bot",
  fallback: "bot",
  maintenanceMessage: "bot",
  retentionDays: "data",
};

const SHORT_DAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"];

type Draft = Settings;
const toDraft = (s: Settings): Draft => s;

type Notice = { kind: "ok" | "err"; text: string } | null;

export function SettingsView() {
  const { user } = useApp();
  const isAdmin = user?.role === "admin";
  const { data, mutate } = useSettings();
  const [tab, setTab] = useState<TabId>("general");
  const [notice, setNotice] = useState<Notice>(null);
  // Bumped when stored data is replaced wholesale (restore / reset) so the draft restarts from it.
  const [epoch, setEpoch] = useState(0);

  if (!data) {
    return (
      <>
        <div className="page-head">
          <h1>সেটিংস</h1>
        </div>
        <div className="card empty" style={{ borderTop: 0 }}>
          লোড হচ্ছে…
        </div>
      </>
    );
  }
  return (
    <SettingsForm
      key={epoch}
      saved={data.settings}
      isAdmin={isAdmin}
      tab={isAdmin ? tab : "general"}
      setTab={setTab}
      notice={notice}
      setNotice={setNotice}
      onSaved={async (next) => {
        await mutate({ settings: next }, { revalidate: false });
      }}
      onReplaced={async () => {
        await mutate();
        setEpoch((n) => n + 1);
      }}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className="switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="track">
        <span className="knob" />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function SettingsForm({
  saved,
  isAdmin,
  tab,
  setTab,
  notice,
  setNotice,
  onSaved,
  onReplaced,
}: {
  saved: Settings;
  isAdmin: boolean;
  tab: TabId;
  setTab: (t: TabId) => void;
  notice: Notice;
  setNotice: (n: Notice) => void;
  onSaved: (s: Settings) => Promise<void>;
  onReplaced: () => Promise<void>;
}) {
  const { lang, setLang, theme, setTheme } = useApp();
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errorTabs = new Set((Object.keys(errors) as (keyof SettingsErrors)[]).map((k) => TAB_OF_ERROR[k]));

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    const keys = Object.keys(errs) as (keyof SettingsErrors)[];
    if (keys.length) {
      setTab(TAB_OF_ERROR[keys[0]]);
      setNotice({ kind: "err", text: "কিছু তথ্য সঠিক নয়। চিহ্নিত ঘরগুলো ঠিক করে আবার সংরক্ষণ করুন।" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ settings: Settings }>("/api/admin/settings", { method: "PUT", body: draft });
      await onSaved(res.settings);
      setDraft(res.settings);
      setNotice({ kind: "ok", text: "সেটিংস সংরক্ষণ করা হয়েছে এবং সঙ্গে সঙ্গে কার্যকর হয়েছে।" });
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    setDraft(saved);
    setErrors({});
    setNotice(null);
  };

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const numVal = (n: number) => (Number.isNaN(n) ? "" : n);
  const inHoursNow = withinWorkingHours(draft.hours);
  const visibleTabs = isAdmin ? TABS : TABS.filter((tb) => tb.id === "general");

  return (
    <>
      <div className="page-head">
        <h1>সেটিংস</h1>
        <p>বট, হস্তান্তর নীতি, টিম ও ডেটা ব্যবস্থাপনা। এখানকার প্রতিটি সেটিং সরাসরি চ্যাট ও অ্যাডমিন প্যানেলে কার্যকর হয়।</p>
      </div>

      <div role="status" aria-live="polite" className="livereg">
        {notice && <div className={notice.kind === "ok" ? "notice" : "notice err"}>{notice.text}</div>}
      </div>

      <div className="pillrow" role="tablist" aria-label="সেটিংসের বিভাগ" hidden={!isAdmin}>
        {visibleTabs.map((tb) => (
          <button key={tb.id} type="button" role="tab" id={`tab-${tb.id}`} aria-controls={`panel-${tb.id}`} className="pill" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}>
            {tb.label}
            {errorTabs.has(tb.id) && <span className="tab-dot" aria-label="ত্রুটি আছে" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="settings-panel">
        {tab === "general" && (
          <>
            {isAdmin && (
            <section className="card card-pad">
              <h2 className="card-title">প্রতিষ্ঠান</h2>
              <div className="form-grid">
                <Field label="প্যানেলের নাম" hint="অ্যাডমিন সাইডবারের শিরোনাম।" error={errors.panelTitle}>
                  <input type="text" className="input" value={draft.org.panelTitle} onChange={(e) => patch("org", { ...draft.org, panelTitle: e.target.value })} />
                </Field>
                <Field label="বিভাগ / দপ্তরের নাম" hint="সাইডবারে শিরোনামের নিচে দেখানো হয়।" error={errors.departmentName}>
                  <input type="text" className="input" value={draft.org.departmentName} onChange={(e) => patch("org", { ...draft.org, departmentName: e.target.value })} />
                </Field>
              </div>
            </section>
            )}
            <section className="card card-pad">
              <h2 className="card-title">ইন্টারফেস</h2>
              <p className="hint" style={{ marginBottom: 12 }}>এই দুটি সেটিং শুধু এই ব্রাউজারের জন্য এবং সঙ্গে সঙ্গে প্রযোজ্য হয় (সংরক্ষণ বাটন লাগে না)।</p>
              <div className="form-grid">
                <Field label="ভাষা">
                  <select className="input" value={lang} onChange={(e) => setLang(e.target.value === "en" ? "en" : "bn")}>
                    <option value="bn">বাংলা</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label="থিম">
                  <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                    <option value="">ডিভাইসের সেটিং অনুযায়ী</option>
                    <option value="light">হালকা</option>
                    <option value="dark">গাঢ়</option>
                  </select>
                </Field>
              </div>
            </section>
            <PasswordCard />
          </>
        )}

        {tab === "handoff" && (
          <>
            <section className="card card-pad">
              <h2 className="card-title">মানব প্রতিনিধির হস্তান্তর</h2>
              <div className="stack">
                <Toggle checked={draft.handoff.enabled} onChange={(v) => patch("handoff", { ...draft.handoff, enabled: v })} label="চ্যাটে “মানব প্রতিনিধির সাথে কথা বলুন” লিঙ্ক দেখান" />
                <Field label="প্রথম সাড়ার সময়সীমা (SLA), মিনিট" hint="এর মধ্যে গ্রহণ না করলে হস্তান্তর “SLA ছাড়িয়েছে” হিসেবে লাল চিহ্নিত হয়। নাগরিককেও এই সময়ই জানানো হয়।" error={errors.slaMinutes}>
                  <input type="number" className="input" style={{ maxWidth: 140 }} min={1} max={240} value={numVal(draft.slaMinutes)} onChange={(e) => patch("slaMinutes", num(e.target.value))} />
                </Field>
              </div>
            </section>

            <section className="card card-pad">
              <h2 className="card-title">কার্যদিবস ও অফিস সময়</h2>
              <div className="stack">
                <Toggle checked={draft.hours.enabled} onChange={(v) => patch("hours", { ...draft.hours, enabled: v })} label="অফিস সময় সীমিত করুন (বন্ধ থাকলে সার্বক্ষণিক)" />
                {draft.hours.enabled && (
                  <>
                    <div>
                      <div className="field-label">কার্যদিবস</div>
                      <div className="pillrow daychips" role="group" aria-label="কার্যদিবস">
                        {SHORT_DAYS.map((d, i) => {
                          const on = draft.hours.days.includes(i);
                          return (
                            <button
                              key={d}
                              type="button"
                              className="pill"
                              aria-pressed={on}
                              aria-label={WEEKDAYS[i]}
                              onClick={() => patch("hours", { ...draft.hours, days: on ? draft.hours.days.filter((x) => x !== i) : [...draft.hours.days, i].sort() })}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label="শুরু">
                        <input type="time" className="input" value={draft.hours.start} onChange={(e) => patch("hours", { ...draft.hours, start: e.target.value })} />
                      </Field>
                      <Field label="শেষ">
                        <input type="time" className="input" value={draft.hours.end} onChange={(e) => patch("hours", { ...draft.hours, end: e.target.value })} />
                      </Field>
                    </div>
                    {errors.hours && (
                      <div className="field-error" role="alert">
                        {errors.hours}
                      </div>
                    )}
                  </>
                )}
                <div className="hint">
                  সময়সূচি: {hoursSummary(draft.hours)} (বাংলাদেশ সময়) · এই মুহূর্তে{" "}
                  <span className="badge" style={{ background: inHoursNow ? "var(--success-soft)" : "var(--warn-soft)", color: inHoursNow ? "var(--success)" : "var(--warn)" }}>
                    {inHoursNow ? "অফিস সময়ের মধ্যে" : "অফিস সময়ের বাইরে"}
                  </span>
                </div>
                <Field label="অফিস সময়ের বাইরে নাগরিককে যে বার্তা দেখানো হবে" hint="নাগরিক এই সময়ে হস্তান্তর চাইলে চ্যাটে এই বার্তা দেখানো হয়; অনুরোধটি তবুও নথিভুক্ত হয়।" error={errors.offHoursMessage}>
                  <textarea className="input" rows={3} value={draft.handoff.offHoursMessage} onChange={(e) => patch("handoff", { ...draft.handoff, offHoursMessage: e.target.value })} />
                </Field>
              </div>
            </section>
          </>
        )}

        {tab === "bot" && (
          <>
            <section className="card card-pad">
              <h2 className="card-title">বটের বার্তা</h2>
              <div className="stack">
                <Field label="স্বাগত বার্তা" hint="প্রতিটি নতুন কথোপকথনের শুরুতে দেখানো হয়।" error={errors.greeting}>
                  <textarea className="input" rows={3} value={draft.bot.greeting} onChange={(e) => patch("bot", { ...draft.bot, greeting: e.target.value })} />
                </Field>
                <div className="preview" aria-label="স্বাগত বার্তার প্রিভিউ">
                  <div className="msg bot">
                    <div className="avatar bot">AI</div>
                    <div className="bubble bot">{draft.bot.greeting || "…"}</div>
                  </div>
                </div>
                <Field label="উত্তর না পেলে বার্তা" hint="প্রশ্ন বুঝতে না পারলে বট এটি বলে। এসব কথোপকথন লগে “উত্তর পাওয়া যায়নি” হিসেবে জমা হয়।" error={errors.fallback}>
                  <textarea className="input" rows={3} value={draft.bot.fallback} onChange={(e) => patch("bot", { ...draft.bot, fallback: e.target.value })} />
                </Field>
                <div>
                  <button type="button" className="btn-link" onClick={() => patch("bot", { ...draft.bot, greeting: DEFAULT_SETTINGS.bot.greeting, fallback: DEFAULT_SETTINGS.bot.fallback })}>
                    বার্তা দুটি ডিফল্টে ফিরিয়ে আনুন
                  </button>
                </div>
              </div>
            </section>
            <section className="card card-pad">
              <h2 className="card-title">রক্ষণাবেক্ষণ মোড</h2>
              <div className="stack">
                <Toggle checked={draft.bot.maintenance} onChange={(v) => patch("bot", { ...draft.bot, maintenance: v })} label="রক্ষণাবেক্ষণ মোড চালু করুন" />
                <p className="hint">চালু থাকলে বট কোনো প্রশ্নের উত্তর দেয় না, চ্যাটে একটি সতর্কবার্তা দেখায়। মানব প্রতিনিধির হস্তান্তর আগের মতোই কাজ করে।</p>
                <Field label="রক্ষণাবেক্ষণের বার্তা" error={errors.maintenanceMessage}>
                  <textarea className="input" rows={3} value={draft.bot.maintenanceMessage} onChange={(e) => patch("bot", { ...draft.bot, maintenanceMessage: e.target.value })} />
                </Field>
              </div>
            </section>
          </>
        )}

        {tab === "team" && <TeamPanel setNotice={setNotice} />}

        {tab === "data" && (
          <>
            <section className="card card-pad">
              <h2 className="card-title">সংরক্ষণের সময়সীমা</h2>
              <RetentionBlock draftDays={draft.retentionDays} savedDays={saved.retentionDays} error={errors.retentionDays} onChange={(n) => patch("retentionDays", n)} setNotice={setNotice} />
            </section>
            <DataPanel setNotice={setNotice} onReplaced={onReplaced} />
          </>
        )}
      </div>

      {isAdmin && (dirty || Object.keys(errors).length > 0) && (
        <div className="savebar" role="region" aria-label="সংরক্ষণ">
          <span>{dirty ? "অসংরক্ষিত পরিবর্তন আছে" : "কিছু তথ্য সঠিক নয়"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={discard}>
              বাতিল
            </button>
            <button type="button" className="btn btn-solid" onClick={save} disabled={busy}>
              {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- account (every user) ---------------- */

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card card-pad">
      <h2 className="card-title">আমার পাসওয়ার্ড পরিবর্তন</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== again) return setMsg({ kind: "err", text: "নতুন পাসওয়ার্ড দুটি মিলছে না।" });
          setBusy(true);
          try {
            await api("/api/auth/password", { body: { current, next } });
            setMsg({ kind: "ok", text: "পাসওয়ার্ড পরিবর্তন হয়েছে।" });
            setCurrent("");
            setNext("");
            setAgain("");
          } catch (err) {
            setMsg({ kind: "err", text: errorMessage(err) });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="বর্তমান পাসওয়ার্ড">
            <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <span />
          <Field label="নতুন পাসওয়ার্ড" hint="কমপক্ষে ৮ অক্ষর।">
            <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="নতুন পাসওয়ার্ড আবার">
            <input type="password" className="input" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
          </Field>
        </div>
        {msg && (
          <div className={msg.kind === "ok" ? "notice" : "notice err"} role="status">
            {msg.text}
          </div>
        )}
        <div>
          <button type="submit" className="btn btn-outline" disabled={busy || !current || !next}>
            পাসওয়ার্ড পরিবর্তন করুন
          </button>
        </div>
      </form>
    </section>
  );
}

/* ---------------- team (saved immediately, admin only) ---------------- */

function TeamPanel({ setNotice }: { setNotice: (n: Notice) => void }) {
  const { user } = useApp();
  const { data, mutate } = useTeam();
  const team = data?.team ?? [];
  const [form, setForm] = useState({ name: "", email: "", password: "", title: "", role: "officer" as Role });
  const [error, setError] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    try {
      await fn();
      await mutate();
      if (ok) setNotice({ kind: "ok", text: ok });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const patch = (id: string, body: object, ok?: string) => run(() => api(`/api/admin/team/${id}`, { method: "PATCH", body }), ok);

  return (
    <section className="card">
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <h2 className="card-title">টিমের সদস্য</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          প্রত্যেক সদস্যের নিজস্ব ইমেইল ও পাসওয়ার্ড আছে; তাঁর নামেই হস্তান্তরের কাজ ও নোট সংরক্ষিত হয়। পরিবর্তন সঙ্গে সঙ্গে কার্যকর হয়। পুরনো হস্তান্তরের ইতিহাস ঠিক রাখতে নাম বদলানো বা সদস্য মুছে ফেলা যায় না — শুধু নিষ্ক্রিয় করা যায়। অ্যাডমিন নতুন সদস্য যোগ, ভূমিকা পরিবর্তন ও পাসওয়ার্ড রিসেট করতে পারেন; অফিসার শুধু হস্তান্তর, কথোপকথন ও নলেজ বেস ব্যবহার করতে পারেন।
        </p>
      </div>
      {error && (
        <div className="notice err" role="alert" style={{ margin: "0 20px 12px" }}>
          {error}
        </div>
      )}
      <div className="table-wrap">
        <table className="compact-first" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th>নাম / ইমেইল</th>
              <th>পদবি</th>
              <th>ভূমিকা</th>
              <th>স্ট্যাটাস</th>
              <th>পাসওয়ার্ড</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 600, color: m.active ? "var(--text)" : "var(--text-3)" }}>
                    {m.name}
                    {user?.id === m.id ? " (আপনি)" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>{m.email}</div>
                </td>
                <td>
                  <input type="text" className="input" style={{ width: "100%", minWidth: 170 }} defaultValue={m.title} aria-label={`${m.name}-এর পদবি`} onBlur={(e) => e.target.value.trim() !== m.title && patch(m.id, { title: e.target.value.trim() })} />
                </td>
                <td>
                  <select className="input" value={m.role} aria-label={`${m.name}-এর ভূমিকা`} onChange={(e) => patch(m.id, { role: e.target.value })}>
                    <option value="officer">অফিসার</option>
                    <option value="admin">অ্যাডমিন</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="switch" role="switch" aria-checked={m.active} aria-label={`${m.name} সক্রিয়`} onClick={() => patch(m.id, { active: !m.active })}>
                    <span className="track">
                      <span className="knob" />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: m.active ? "var(--success)" : "var(--text-3)" }}>{m.active ? "সক্রিয়" : "নিষ্ক্রিয়"}</span>
                  </button>
                </td>
                <td>
                  {resetFor === m.id ? (
                    <form
                      style={{ display: "flex", gap: 6 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await patch(m.id, { password: newPw }, `${m.name}-এর পাসওয়ার্ড রিসেট হয়েছে।`);
                        setResetFor(null);
                        setNewPw("");
                      }}
                    >
                      <input type="password" className="input" style={{ width: 140 }} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="নতুন পাসওয়ার্ড" aria-label="নতুন পাসওয়ার্ড" autoComplete="new-password" />
                      <button type="submit" className="btn btn-solid" disabled={newPw.length < 8}>
                        সেট
                      </button>
                    </form>
                  ) : (
                    <button type="button" className="btn-link" onClick={() => setResetFor(m.id)}>
                      রিসেট করুন
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="card-pad add-member"
        onSubmit={async (e) => {
          e.preventDefault();
          await run(() => api("/api/admin/team", { body: form }), `${form.name} যোগ করা হয়েছে।`);
          setForm((f) => (error ? f : { name: "", email: "", password: "", title: "", role: "officer" }));
        }}
      >
        <input type="text" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="নাম" aria-label="নতুন সদস্যের নাম" required />
        <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ইমেইল" aria-label="ইমেইল" required />
        <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="প্রাথমিক পাসওয়ার্ড (৮+ অক্ষর)" aria-label="প্রাথমিক পাসওয়ার্ড" autoComplete="new-password" required />
        <input type="text" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="পদবি (ঐচ্ছিক)" aria-label="পদবি" />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} aria-label="ভূমিকা" style={{ flex: "0 1 130px" }}>
          <option value="officer">অফিসার</option>
          <option value="admin">অ্যাডমিন</option>
        </select>
        <button type="submit" className="btn btn-solid" disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8}>
          + সদস্য যোগ করুন
        </button>
      </form>
    </section>
  );
}

/* ---------------- data & privacy (admin) ---------------- */

interface DataStats {
  conversations: number;
  escalations: number;
  kb: number;
  retentionDays: number;
  purgeable: number;
}

function RetentionBlock({ draftDays, savedDays, error, onChange, setNotice }: { draftDays: number; savedDays: number; error?: string; onChange: (n: number) => void; setNotice: (n: Notice) => void }) {
  const { data: stats, mutate } = useSWR<DataStats>("/api/admin/data/stats", fetcher);
  const [confirm, setConfirm] = useState(false);
  const willDelete = stats?.purgeable ?? 0;

  return (
    <div className="stack">
      <Field label="কথোপকথন কতদিন রাখা হবে (দিন)" hint="০ দিলে চিরকাল রাখা হবে; নইলে ৭ থেকে ৩৬৫০ দিন। সময় পার হলে শেষ হওয়া কথোপকথন প্রতিদিন স্বয়ংক্রিয়ভাবে মুছে যায়। খোলা হস্তান্তরের কথোপকথন কখনোই মোছা হয় না।" error={error}>
        <input type="number" className="input" style={{ maxWidth: 160 }} min={0} max={3650} value={Number.isNaN(draftDays) ? "" : draftDays} onChange={(e) => onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value))} />
      </Field>
      <div className="hint">
        {savedDays > 0 ? (willDelete > 0 ? `সংরক্ষিত সেটিং (${bn(savedDays)} দিন) অনুযায়ী এখন ${bn(willDelete)}টি কথোপকথন মোছার যোগ্য।` : `সংরক্ষিত সেটিং (${bn(savedDays)} দিন) অনুযায়ী মোছার মতো কোনো কথোপকথন নেই।`) : "বর্তমানে সব কথোপকথন চিরকাল রাখা হচ্ছে।"}
      </div>
      <div>
        <button type="button" className="btn btn-outline" disabled={willDelete === 0} onClick={() => setConfirm(true)}>
          এখনই পরিষ্কার করুন
        </button>
      </div>
      <ConfirmModal
        open={confirm}
        title="পুরনো কথোপকথন মুছে ফেলবেন?"
        body={`${bn(willDelete)}টি কথোপকথন স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে না। (হস্তান্তরের রেকর্ড থাকবে, শুধু প্রতিলিপি মুছবে।)`}
        confirmLabel="মুছে ফেলুন"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          try {
            const r = await api<{ deleted: number }>("/api/admin/data/purge", { body: {} });
            await mutate();
            setNotice({ kind: "ok", text: `${bn(r.deleted)}টি পুরনো কথোপকথন মুছে ফেলা হয়েছে।` });
          } catch (e) {
            setNotice({ kind: "err", text: errorMessage(e) });
          }
        }}
      />
    </div>
  );
}

function DataPanel({ setNotice, onReplaced }: { setNotice: (n: Notice) => void; onReplaced: () => Promise<void> }) {
  const { data: stats, mutate } = useSWR<DataStats>("/api/admin/data/stats", fetcher);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <section className="card card-pad">
        <h2 className="card-title">ব্যাকআপ ও পুনরুদ্ধার</h2>
        <div className="stack">
          <p className="hint">
            সব তথ্য MongoDB ডাটাবেসে সংরক্ষিত{stats ? `: ${bn(stats.conversations)}টি কথোপকথন, ${bn(stats.escalations)}টি হস্তান্তর, ${bn(stats.kb)}টি নলেজ বেস এন্ট্রি` : ""}। ব্যাকআপ ফাইলে সদস্যদের অ্যাকাউন্ট বা পাসওয়ার্ড থাকে না, কিন্তু নাগরিকদের কথোপকথন থাকে — নিরাপদ স্থানে রাখুন।
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn btn-solid" href="/api/admin/data/export" download>
              ব্যাকআপ ডাউনলোড (JSON)
            </a>
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              ব্যাকআপ থেকে পুনরুদ্ধার…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) setPendingImport(await f.text());
              }}
            />
          </div>
        </div>
      </section>

      <section className="card card-pad danger-zone">
        <h2 className="card-title">বিপজ্জনক এলাকা</h2>
        <p className="hint" style={{ marginBottom: 12 }}>সব কথোপকথন, হস্তান্তর, নলেজ বেস ও সেটিংস মুছে প্রাথমিক ডেমো ডেটায় ফিরে যাবে (সদস্যদের অ্যাকাউন্ট থাকবে)। আগে ব্যাকআপ নিয়ে রাখুন।</p>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>
          ডেমো ডেটায় রিসেট করুন
        </button>
      </section>

      <ConfirmModal
        open={pendingImport !== null}
        title="ব্যাকআপ থেকে পুনরুদ্ধার করবেন?"
        body="বর্তমান সব কথোপকথন, হস্তান্তর, নলেজ বেস ও সেটিংস ব্যাকআপ ফাইলের তথ্য দিয়ে প্রতিস্থাপিত হবে।"
        confirmLabel="পুনরুদ্ধার করুন"
        onCancel={() => setPendingImport(null)}
        onConfirm={async () => {
          const text = pendingImport;
          setPendingImport(null);
          try {
            const res = await fetch("/api/admin/data/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text ?? "" });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "পুনরুদ্ধার ব্যর্থ হয়েছে।");
            await mutate();
            await onReplaced();
            setNotice({ kind: "ok", text: "ব্যাকআপ থেকে সফলভাবে পুনরুদ্ধার করা হয়েছে।" });
          } catch (e) {
            setNotice({ kind: "err", text: errorMessage(e) });
          }
        }}
      />
      <ConfirmModal
        open={confirmReset}
        danger
        title="সব তথ্য রিসেট করবেন?"
        body="বর্তমান সব কথোপকথন, হস্তান্তর, নলেজ বেস এন্ট্রি ও সেটিংস মুছে যাবে এবং ডেমো ডেটা ফিরে আসবে। এটি ফেরানো যাবে না।"
        confirmLabel="হ্যাঁ, রিসেট করুন"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          try {
            await api("/api/admin/data/reset", { body: { confirm: "RESET" } });
            await mutate();
            await onReplaced();
            setNotice({ kind: "ok", text: "সব তথ্য ডেমো ডেটায় রিসেট করা হয়েছে।" });
          } catch (e) {
            setNotice({ kind: "err", text: errorMessage(e) });
          }
        }}
      />
    </>
  );
}

function ConfirmModal({ open, title, body, confirmLabel, danger, onConfirm, onCancel }: { open: boolean; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p>{body}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" onClick={onCancel} data-autofocus>
          বাতিল
        </button>
        <button type="button" className={danger ? "btn btn-danger" : "btn btn-solid"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
