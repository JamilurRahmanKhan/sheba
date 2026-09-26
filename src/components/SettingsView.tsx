"use client";

import { useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { useApp, type Theme } from "./AppProvider";
import { Modal } from "./Modal";
import { api, errorMessage, fetcher } from "@/lib/api";
import { useSettings, useTeam } from "@/lib/hooks";
import { bn, fmtDateTime } from "@/lib/conversations";
import { DEFAULT_SETTINGS, hoursSummary, validateSettings, withinWorkingHours, type Role, type Settings, type SettingsErrors, weekdayName } from "@/lib/settings";

type TabId = "general" | "handoff" | "bot" | "team" | "data" | "audit";

const TABS: { id: TabId; bn: string; en: string }[] = [
  { id: "general", bn: "সাধারণ", en: "General" },
  { id: "handoff", bn: "হস্তান্তর ও সময়সূচি", en: "Hand-off & schedule" },
  { id: "bot", bn: "বট", en: "Bot" },
  { id: "team", bn: "টিম", en: "Team" },
  { id: "data", bn: "ডেটা ও গোপনীয়তা", en: "Data & privacy" },
  { id: "audit", bn: "অডিট লগ", en: "Audit log" },
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
  templates: "handoff",
};

const SHORT_DAYS: [string, string][] = [["রবি", "Sun"], ["সোম", "Mon"], ["মঙ্গল", "Tue"], ["বুধ", "Wed"], ["বৃহ", "Thu"], ["শুক্র", "Fri"], ["শনি", "Sat"]];

type Draft = Settings;
const toDraft = (s: Settings): Draft => s;

type Notice = { kind: "ok" | "err"; text: string } | null;

export function SettingsView() {
  const { user, tr } = useApp();
  const isAdmin = user?.role === "admin";
  const { data, mutate } = useSettings();
  const aiConfigured = !!data?.aiConfigured;
  const aiModel = data?.aiModel ?? null;
  const [tab, setTab] = useState<TabId>("general");
  const [notice, setNotice] = useState<Notice>(null);
  // Bumped when stored data is replaced wholesale (restore / reset) so the draft restarts from it.
  const [epoch, setEpoch] = useState(0);

  if (!data) {
    return (
      <>
        <div className="page-head">
          <h1>{tr("সেটিংস", "Settings")}</h1>
        </div>
        <div className="card empty" style={{ borderTop: 0 }}>
          {tr("লোড হচ্ছে…", "Loading…")}
        </div>
      </>
    );
  }
  return (
    <SettingsForm
      key={epoch}
      saved={data.settings}
      isAdmin={isAdmin}
      aiConfigured={aiConfigured}
      aiModel={aiModel}
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
  aiConfigured,
  aiModel,
  tab,
  setTab,
  notice,
  setNotice,
  onSaved,
  onReplaced,
}: {
  saved: Settings;
  isAdmin: boolean;
  aiConfigured: boolean;
  aiModel: string | null;
  tab: TabId;
  setTab: (t: TabId) => void;
  notice: Notice;
  setNotice: (n: Notice) => void;
  onSaved: (s: Settings) => Promise<void>;
  onReplaced: () => Promise<void>;
}) {
  const { lang, setLang, theme, setTheme, tr } = useApp();
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [busy, setBusy] = useState(false);

  // If the saved settings change underneath an UNTOUCHED form (another admin/tab, a redeploy), follow them
  // instead of reporting phantom "unsaved changes" that would overwrite the newer values on save.
  const savedJson = JSON.stringify(saved);
  const [baseline, setBaseline] = useState(savedJson);
  if (savedJson !== baseline) {
    setBaseline(savedJson);
    if (JSON.stringify(draft) === baseline) setDraft(saved);
  }

  const dirty = JSON.stringify(draft) !== savedJson;
  const errorTabs = new Set((Object.keys(errors) as (keyof SettingsErrors)[]).map((k) => TAB_OF_ERROR[k]));

  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    const keys = Object.keys(errs) as (keyof SettingsErrors)[];
    if (keys.length) {
      setTab(TAB_OF_ERROR[keys[0]]);
      setNotice({ kind: "err", text: tr("কিছু তথ্য সঠিক নয়। চিহ্নিত ঘরগুলো ঠিক করে আবার সংরক্ষণ করুন।", "Some fields are invalid. Fix the highlighted fields and save again.") });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ settings: Settings }>("/api/admin/settings", { method: "PUT", body: draft });
      await onSaved(res.settings);
      setDraft(res.settings);
      setNotice({ kind: "ok", text: tr("সেটিংস সংরক্ষণ করা হয়েছে এবং সঙ্গে সঙ্গে কার্যকর হয়েছে।", "Settings saved and applied immediately.") });
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
        <h1>{tr("সেটিংস", "Settings")}</h1>
        <p>{tr("বট, হস্তান্তর নীতি, টিম ও ডেটা ব্যবস্থাপনা। এখানকার প্রতিটি সেটিং সরাসরি চ্যাট ও অ্যাডমিন প্যানেলে কার্যকর হয়।", "Bot, hand-off policy, team and data management. Every setting here takes effect directly in the chat and admin panel.")}</p>
      </div>

      <div role="status" aria-live="polite" className="livereg">
        {notice && <div className={notice.kind === "ok" ? "notice" : "notice err"}>{notice.text}</div>}
      </div>

      <div className="pillrow" role="tablist" aria-label={tr("সেটিংসের বিভাগ", "Settings sections")} hidden={!isAdmin}>
        {visibleTabs.map((tb) => (
          <button key={tb.id} type="button" role="tab" id={`tab-${tb.id}`} aria-controls={`panel-${tb.id}`} className="pill" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}>
            {tr(tb.bn, tb.en)}
            {errorTabs.has(tb.id) && <span className="tab-dot" aria-label={tr("ত্রুটি আছে", "Has errors")} />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="settings-panel">
        {tab === "general" && (
          <>
            {isAdmin && (
            <section className="card card-pad">
              <h2 className="card-title">{tr("প্রতিষ্ঠান", "Organisation")}</h2>
              <div className="form-grid">
                <Field label={tr("প্যানেলের নাম", "Panel name")} hint={tr("অ্যাডমিন সাইডবারের শিরোনাম।", "Title of the admin sidebar.")} error={errors.panelTitle}>
                  <input type="text" className="input" value={draft.org.panelTitle} onChange={(e) => patch("org", { ...draft.org, panelTitle: e.target.value })} />
                </Field>
                <Field label={tr("বিভাগ / দপ্তরের নাম", "Department / office name")} hint={tr("সাইডবারে শিরোনামের নিচে দেখানো হয়।", "Shown under the title in the sidebar.")} error={errors.departmentName}>
                  <input type="text" className="input" value={draft.org.departmentName} onChange={(e) => patch("org", { ...draft.org, departmentName: e.target.value })} />
                </Field>
              </div>
            </section>
            )}
            <section className="card card-pad">
              <h2 className="card-title">{tr("ইন্টারফেস", "Interface")}</h2>
              <p className="hint" style={{ marginBottom: 12 }}>{tr("এই দুটি সেটিং শুধু এই ব্রাউজারের জন্য এবং সঙ্গে সঙ্গে প্রযোজ্য হয় (সংরক্ষণ বাটন লাগে না)।", "These two settings apply only to this browser and take effect immediately (no save needed).")}</p>
              <div className="form-grid">
                <Field label={tr("ভাষা", "Language")}>
                  <select className="input" value={lang} onChange={(e) => setLang(e.target.value === "en" ? "en" : "bn")}>
                    <option value="bn">বাংলা</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label={tr("থিম", "Theme")}>
                  <select className="input" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                    <option value="">{tr("ডিভাইসের সেটিং অনুযায়ী", "Follow device setting")}</option>
                    <option value="light">{tr("হালকা", "Light")}</option>
                    <option value="dark">{tr("গাঢ়", "Dark")}</option>
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
              <h2 className="card-title">{tr("মানব প্রতিনিধির হস্তান্তর", "Human agent hand-off")}</h2>
              <div className="stack">
                <Toggle checked={draft.handoff.enabled} onChange={(v) => patch("handoff", { ...draft.handoff, enabled: v })} label={tr("চ্যাটে “মানব প্রতিনিধির সাথে কথা বলুন” লিঙ্ক দেখান", "Show the “Talk to a human agent” link in the chat")} />
                <Field label={tr("প্রথম সাড়ার সময়সীমা (SLA), মিনিট", "First-response time limit (SLA), minutes")} hint={tr("এর মধ্যে গ্রহণ না করলে হস্তান্তর “SLA ছাড়িয়েছে” হিসেবে লাল চিহ্নিত হয়। নাগরিককেও এই সময়ই জানানো হয়।", "If not accepted within this time, the hand-off is flagged red as “past SLA”. Citizens are told the same time.")} error={errors.slaMinutes}>
                  <input type="number" className="input" style={{ maxWidth: 140 }} min={1} max={240} value={numVal(draft.slaMinutes)} onChange={(e) => patch("slaMinutes", num(e.target.value))} />
                </Field>
              </div>
            </section>

            <section className="card card-pad">
              <h2 className="card-title">{tr("কার্যদিবস ও অফিস সময়", "Working days & office hours")}</h2>
              <div className="stack">
                <Toggle checked={draft.hours.enabled} onChange={(v) => patch("hours", { ...draft.hours, enabled: v })} label={tr("অফিস সময় সীমিত করুন (বন্ধ থাকলে সার্বক্ষণিক)", "Limit to office hours (off means 24/7)")} />
                {draft.hours.enabled && (
                  <>
                    <div>
                      <div className="field-label">{tr("কার্যদিবস", "Working days")}</div>
                      <div className="pillrow daychips" role="group" aria-label={tr("কার্যদিবস", "Working days")}>
                        {SHORT_DAYS.map(([dbn, den], i) => {
                          const on = draft.hours.days.includes(i);
                          return (
                            <button
                              key={dbn}
                              type="button"
                              className="pill"
                              aria-pressed={on}
                              aria-label={weekdayName(i)}
                              onClick={() => patch("hours", { ...draft.hours, days: on ? draft.hours.days.filter((x) => x !== i) : [...draft.hours.days, i].sort() })}
                            >
                              {tr(dbn, den)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="form-grid">
                      <Field label={tr("শুরু", "Start")}>
                        <input type="time" className="input" value={draft.hours.start} onChange={(e) => patch("hours", { ...draft.hours, start: e.target.value })} />
                      </Field>
                      <Field label={tr("শেষ", "End")}>
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
                  {tr("সময়সূচি", "Schedule")}: {hoursSummary(draft.hours)} ({tr("বাংলাদেশ সময়", "Bangladesh time")}) · {tr("এই মুহূর্তে", "right now")}{" "}
                  <span className="badge" style={{ background: inHoursNow ? "var(--success-soft)" : "var(--warn-soft)", color: inHoursNow ? "var(--success)" : "var(--warn)" }}>
                    {inHoursNow ? tr("অফিস সময়ের মধ্যে", "within office hours") : tr("অফিস সময়ের বাইরে", "outside office hours")}
                  </span>
                </div>
                <Field label={tr("অফিস সময়ের বাইরে নাগরিককে যে বার্তা দেখানো হবে", "Message shown to citizens outside office hours")} hint={tr("নাগরিক এই সময়ে হস্তান্তর চাইলে চ্যাটে এই বার্তা দেখানো হয়; অনুরোধটি তবুও নথিভুক্ত হয়।", "Shown in the chat when a citizen asks for a hand-off at this time; the request is still recorded.")} error={errors.offHoursMessage}>
                  <textarea className="input" rows={3} value={draft.handoff.offHoursMessage} onChange={(e) => patch("handoff", { ...draft.handoff, offHoursMessage: e.target.value })} />
                </Field>
              </div>
            </section>
          </>
        )}

        {tab === "handoff" && (
          <section className="card card-pad">
            <h2 className="card-title">{tr("সংরক্ষিত উত্তর (টেমপ্লেট)", "Saved replies (templates)")}</h2>
            <p className="hint" style={{ marginBottom: 12 }}>{tr("হস্তান্তরের উত্তর লেখার সময় অফিসাররা এগুলো এক ক্লিকে ঢুকিয়ে নিতে পারেন। পাঠানোর আগে তাঁরা লেখা পরিবর্তনও করতে পারেন।", "Officers can insert these in one click when replying to a hand-off, and edit the text before sending.")}</p>
            <div className="stack">
              {draft.replyTemplates.map((tpl, i) => (
                <div key={tpl.id} className="tpl">
                  <input type="text" className="input" value={tpl.title} maxLength={60} placeholder={tr("শিরোনাম", "Title")} aria-label={`${tr("টেমপ্লেট", "Template")} ${bn(i + 1)} ${tr("শিরোনাম", "title")}`} onChange={(e) => patch("replyTemplates", draft.replyTemplates.map((x) => (x.id === tpl.id ? { ...x, title: e.target.value } : x)))} />
                  <textarea className="input" rows={2} value={tpl.text} maxLength={1000} placeholder={tr("উত্তরের লেখা", "Reply text")} aria-label={`${tr("টেমপ্লেট", "Template")} ${bn(i + 1)} ${tr("লেখা", "text")}`} onChange={(e) => patch("replyTemplates", draft.replyTemplates.map((x) => (x.id === tpl.id ? { ...x, text: e.target.value } : x)))} />
                  <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => patch("replyTemplates", draft.replyTemplates.filter((x) => x.id !== tpl.id))}>
                    {tr("মুছুন", "Delete")}
                  </button>
                </div>
              ))}
              {errors.templates && (
                <div className="field-error" role="alert">
                  {errors.templates}
                </div>
              )}
              <div>
                <button type="button" className="btn btn-outline" disabled={draft.replyTemplates.length >= 20} onClick={() => patch("replyTemplates", [...draft.replyTemplates, { id: `t${Date.now()}`, title: "", text: "" }])}>
                  {tr("+ নতুন টেমপ্লেট", "+ New template")}
                </button>
              </div>
            </div>
          </section>
        )}

        {tab === "bot" && (
          <>
            <section className="card card-pad">
              <h2 className="card-title">{tr("AI-চালিত উত্তর", "AI-powered answers")}</h2>
              <div className="stack">
                <Toggle checked={draft.bot.ai} onChange={(v) => patch("bot", { ...draft.bot, ai: v })} label={tr("নলেজ বেসের ভিত্তিতে AI দিয়ে উত্তর তৈরি করুন", "Compose answers with AI based on the knowledge base")} />
                <p className="hint">
                  {tr("স্পষ্ট মিল থাকলে বট নলেজ বেসের উত্তরই হুবহু দেয়। মিল না পেলে AI শুধু নলেজ বেসের এন্ট্রি থেকে উত্তর সাজায়; নিশ্চিত না হলে “বুঝতে পারিনি” বলে। AI ব্যর্থ হলে বা সীমা শেষ হলে সাধারণ বট চলতে থাকে।", "When there is a clear match, the bot gives the knowledge-base answer word for word. Otherwise the AI composes an answer only from knowledge-base entries, and says it did not understand if unsure. If the AI fails or hits its limit, the regular bot keeps working.")}{" "}
                  <strong>{tr("গোপনীয়তা", "Privacy")}:</strong> {tr("AI ব্যবহার করলে নাগরিকের প্রশ্ন (ফোন/NID/ইমেইল মুছে ফেলার পর) বাইরের AI সেবাদাতার কাছে পাঠানো হয়।", "When AI is used, the citizen's question (after phone/NID/email are removed) is sent to an external AI provider.")}
                </p>
                <div className="hint">
                  {tr("অবস্থা", "Status")}:{" "}
                  <span className="badge" style={{ background: aiConfigured ? "var(--success-soft)" : "var(--warn-soft)", color: aiConfigured ? "var(--success)" : "var(--warn)" }}>
                    {aiConfigured ? tr(`সংযুক্ত (${aiModel})`, `Connected (${aiModel})`) : tr("AI কী সেট করা নেই — সাধারণ বট চলছে", "AI key not set — the regular bot is running")}
                  </span>
                </div>
              </div>
            </section>
            <section className="card card-pad">
              <h2 className="card-title">{tr("বটের বার্তা", "Bot messages")}</h2>
              <div className="stack">
                <Field label={tr("স্বাগত বার্তা", "Welcome message")} hint={tr("প্রতিটি নতুন কথোপকথনের শুরুতে দেখানো হয়।", "Shown at the start of every new conversation.")} error={errors.greeting}>
                  <textarea className="input" rows={3} value={draft.bot.greeting} onChange={(e) => patch("bot", { ...draft.bot, greeting: e.target.value })} />
                </Field>
                <div className="preview" aria-label={tr("স্বাগত বার্তার প্রিভিউ", "Welcome message preview")}>
                  <div className="msg bot">
                    <div className="avatar bot">AI</div>
                    <div className="bubble bot">{draft.bot.greeting || "…"}</div>
                  </div>
                </div>
                <Field label={tr("উত্তর না পেলে বার্তা", "No-answer message")} hint={tr("প্রশ্ন বুঝতে না পারলে বট এটি বলে। এসব কথোপকথন লগে “উত্তর পাওয়া যায়নি” হিসেবে জমা হয়।", "The bot says this when it cannot understand a question. These conversations are logged as “Unanswered”.")} error={errors.fallback}>
                  <textarea className="input" rows={3} value={draft.bot.fallback} onChange={(e) => patch("bot", { ...draft.bot, fallback: e.target.value })} />
                </Field>
                <div>
                  <button type="button" className="btn-link" onClick={() => patch("bot", { ...draft.bot, greeting: DEFAULT_SETTINGS.bot.greeting, fallback: DEFAULT_SETTINGS.bot.fallback })}>
                    {tr("বার্তা দুটি ডিফল্টে ফিরিয়ে আনুন", "Restore both messages to defaults")}
                  </button>
                </div>
              </div>
            </section>
            <section className="card card-pad">
              <h2 className="card-title">{tr("রক্ষণাবেক্ষণ মোড", "Maintenance mode")}</h2>
              <div className="stack">
                <Toggle checked={draft.bot.maintenance} onChange={(v) => patch("bot", { ...draft.bot, maintenance: v })} label={tr("রক্ষণাবেক্ষণ মোড চালু করুন", "Turn on maintenance mode")} />
                <p className="hint">{tr("চালু থাকলে বট কোনো প্রশ্নের উত্তর দেয় না, চ্যাটে একটি সতর্কবার্তা দেখায়। মানব প্রতিনিধির হস্তান্তর আগের মতোই কাজ করে।", "While on, the bot answers no questions and the chat shows a warning. Human hand-offs keep working as before.")}</p>
                <Field label={tr("রক্ষণাবেক্ষণের বার্তা", "Maintenance message")} error={errors.maintenanceMessage}>
                  <textarea className="input" rows={3} value={draft.bot.maintenanceMessage} onChange={(e) => patch("bot", { ...draft.bot, maintenanceMessage: e.target.value })} />
                </Field>
              </div>
            </section>
          </>
        )}

        {tab === "team" && <TeamPanel setNotice={setNotice} />}

        {tab === "audit" && <AuditPanel />}

        {tab === "data" && (
          <>
            <section className="card card-pad">
              <h2 className="card-title">{tr("সংরক্ষণের সময়সীমা", "Retention period")}</h2>
              <RetentionBlock draftDays={draft.retentionDays} savedDays={saved.retentionDays} error={errors.retentionDays} onChange={(n) => patch("retentionDays", n)} setNotice={setNotice} />
            </section>
            <DataPanel setNotice={setNotice} onReplaced={onReplaced} />
          </>
        )}
      </div>

      {isAdmin && (dirty || Object.keys(errors).length > 0) && (
        <div className="savebar" role="region" aria-label={tr("সংরক্ষণ", "Save")}>
          <span>{dirty ? tr("অসংরক্ষিত পরিবর্তন আছে", "You have unsaved changes") : tr("কিছু তথ্য সঠিক নয়", "Some fields are invalid")}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={discard}>
              {tr("বাতিল", "Cancel")}
            </button>
            <button type="button" className="btn btn-solid" onClick={save} disabled={busy}>
              {busy ? tr("সংরক্ষণ হচ্ছে…", "Saving…") : tr("সংরক্ষণ করুন", "Save")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- account (every user) ---------------- */

function PasswordCard() {
  const { tr } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card card-pad">
      <h2 className="card-title">{tr("আমার পাসওয়ার্ড পরিবর্তন", "Change my password")}</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== again) return setMsg({ kind: "err", text: tr("নতুন পাসওয়ার্ড দুটি মিলছে না।", "The two new passwords do not match.") });
          setBusy(true);
          try {
            await api("/api/auth/password", { body: { current, next } });
            setMsg({ kind: "ok", text: tr("পাসওয়ার্ড পরিবর্তন হয়েছে।", "Password changed.") });
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
          <Field label={tr("বর্তমান পাসওয়ার্ড", "Current password")}>
            <input type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <span />
          <Field label={tr("নতুন পাসওয়ার্ড", "New password")} hint={tr("কমপক্ষে ৮ অক্ষর।", "At least 8 characters.")}>
            <input type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label={tr("নতুন পাসওয়ার্ড আবার", "New password again")}>
            <input type="password" className="input" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
          </Field>
        </div>
        {msg && (
          <div className={msg.kind === "ok" ? "notice" : "notice err"} role="status">
            {msg.text}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-outline" disabled={busy || !current || !next}>
            {tr("পাসওয়ার্ড পরিবর্তন করুন", "Change password")}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={async () => {
              try {
                await api("/api/auth/logout-all", { body: {} });
                // Full navigation on purpose: the server layout must re-check the ended session.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/login");
              } catch (err) {
                setMsg({ kind: "err", text: errorMessage(err) });
              }
            }}
          >
            {tr("সব ডিভাইস থেকে লগআউট", "Log out of all devices")}
          </button>
        </div>
        <p className="hint">{tr("পাসওয়ার্ড পরিবর্তন করলে অন্য সব ডিভাইসে আপনি আপনাআপনি লগআউট হয়ে যান; এই ব্রাউজারে লগইন থাকে।", "Changing your password logs you out on all other devices; you stay signed in in this browser.")}</p>
      </form>
    </section>
  );
}

/* ---------------- team (saved immediately, admin only) ---------------- */

function TeamPanel({ setNotice }: { setNotice: (n: Notice) => void }) {
  const { user, tr } = useApp();
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
        <h2 className="card-title">{tr("টিমের সদস্য", "Team members")}</h2>
        <p className="hint" style={{ marginBottom: 12 }}>
          {tr("প্রত্যেক সদস্যের নিজস্ব ইমেইল ও পাসওয়ার্ড আছে; তাঁর নামেই হস্তান্তরের কাজ ও নোট সংরক্ষিত হয়। পরিবর্তন সঙ্গে সঙ্গে কার্যকর হয়। পুরনো হস্তান্তরের ইতিহাস ঠিক রাখতে নাম বদলানো বা সদস্য মুছে ফেলা যায় না — শুধু নিষ্ক্রিয় করা যায়। অ্যাডমিন নতুন সদস্য যোগ, ভূমিকা পরিবর্তন ও পাসওয়ার্ড রিসেট করতে পারেন; অফিসার শুধু হস্তান্তর, কথোপকথন ও নলেজ বেস ব্যবহার করতে পারেন।", "Every member has their own email and password; hand-off work and notes are saved under their name. Changes apply immediately. To keep past hand-off history intact, members cannot be renamed or deleted — only deactivated. Admins can add members, change roles and reset passwords; officers can only use hand-offs, conversations and the knowledge base.")}
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
              <th>{tr("নাম / ইমেইল", "Name / email")}</th>
              <th>{tr("পদবি", "Title")}</th>
              <th>{tr("ভূমিকা", "Role")}</th>
              <th>{tr("স্ট্যাটাস", "Status")}</th>
              <th>{tr("পাসওয়ার্ড", "Password")}</th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.id}>
                <td>
                  <div style={{ fontWeight: 600, color: m.active ? "var(--text)" : "var(--text-3)" }}>
                    {m.name}
                    {user?.id === m.id ? tr(" (আপনি)", " (you)") : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-2)" }}>{m.email}</div>
                </td>
                <td>
                  <input type="text" className="input" style={{ width: "100%", minWidth: 170 }} defaultValue={m.title} aria-label={`${m.name} — ${tr("পদবি", "title")}`} onBlur={(e) => e.target.value.trim() !== m.title && patch(m.id, { title: e.target.value.trim() })} />
                </td>
                <td>
                  <select className="input" value={m.role} aria-label={`${m.name} — ${tr("ভূমিকা", "role")}`} onChange={(e) => patch(m.id, { role: e.target.value })}>
                    <option value="officer">{tr("অফিসার", "Officer")}</option>
                    <option value="admin">{tr("অ্যাডমিন", "Admin")}</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="switch" role="switch" aria-checked={m.active} aria-label={`${m.name} — ${tr("সক্রিয়", "active")}`} onClick={() => patch(m.id, { active: !m.active })}>
                    <span className="track">
                      <span className="knob" />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: m.active ? "var(--success)" : "var(--text-3)" }}>{m.active ? tr("সক্রিয়", "Active") : tr("নিষ্ক্রিয়", "Inactive")}</span>
                  </button>
                </td>
                <td>
                  {resetFor === m.id ? (
                    <form
                      style={{ display: "flex", gap: 6 }}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await patch(m.id, { password: newPw }, tr(`${m.name}-এর পাসওয়ার্ড রিসেট হয়েছে।`, `${m.name}'s password was reset.`));
                        setResetFor(null);
                        setNewPw("");
                      }}
                    >
                      <input type="password" className="input" style={{ width: 140 }} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={tr("নতুন পাসওয়ার্ড", "New password")} aria-label={tr("নতুন পাসওয়ার্ড", "New password")} autoComplete="new-password" />
                      <button type="submit" className="btn btn-solid" disabled={newPw.length < 8}>
                        {tr("সেট", "Set")}
                      </button>
                    </form>
                  ) : (
                    <button type="button" className="btn-link" onClick={() => setResetFor(m.id)}>
                      {tr("রিসেট করুন", "Reset")}
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
          await run(() => api("/api/admin/team", { body: form }), tr(`${form.name} যোগ করা হয়েছে।`, `${form.name} was added.`));
          setForm((f) => (error ? f : { name: "", email: "", password: "", title: "", role: "officer" }));
        }}
      >
        <input type="text" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr("নাম", "Name")} aria-label={tr("নতুন সদস্যের নাম", "New member name")} required />
        <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={tr("ইমেইল", "Email")} aria-label={tr("ইমেইল", "Email")} required />
        <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={tr("প্রাথমিক পাসওয়ার্ড (৮+ অক্ষর)", "Initial password (8+ characters)")} aria-label={tr("প্রাথমিক পাসওয়ার্ড", "Initial password")} autoComplete="new-password" required />
        <input type="text" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr("পদবি (ঐচ্ছিক)", "Title (optional)")} aria-label={tr("পদবি", "Title")} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} aria-label={tr("ভূমিকা", "Role")} style={{ flex: "0 1 130px" }}>
          <option value="officer">{tr("অফিসার", "Officer")}</option>
          <option value="admin">{tr("অ্যাডমিন", "Admin")}</option>
        </select>
        <button type="submit" className="btn btn-solid" disabled={!form.name.trim() || !form.email.trim() || form.password.length < 8}>
          {tr("+ সদস্য যোগ করুন", "+ Add member")}
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
  resetAllowed: boolean;
}

function RetentionBlock({ draftDays, savedDays, error, onChange, setNotice }: { draftDays: number; savedDays: number; error?: string; onChange: (n: number) => void; setNotice: (n: Notice) => void }) {
  const { tr } = useApp();
  const { data: stats, mutate } = useSWR<DataStats>("/api/admin/data/stats", fetcher);
  const [confirm, setConfirm] = useState(false);
  const willDelete = stats?.purgeable ?? 0;

  return (
    <div className="stack">
      <Field label={tr("কথোপকথন কতদিন রাখা হবে (দিন)", "How long to keep conversations (days)")} hint={tr("০ দিলে চিরকাল রাখা হবে; নইলে ৭ থেকে ৩৬৫০ দিন। সময় পার হলে শেষ হওয়া কথোপকথন প্রতিদিন স্বয়ংক্রিয়ভাবে মুছে যায়। খোলা হস্তান্তরের কথোপকথন কখনোই মোছা হয় না।", "Enter 0 to keep forever; otherwise 7 to 3650 days. Finished conversations older than this are deleted automatically every day. Conversations with open hand-offs are never deleted.")} error={error}>
        <input type="number" className="input" style={{ maxWidth: 160 }} min={0} max={3650} value={Number.isNaN(draftDays) ? "" : draftDays} onChange={(e) => onChange(e.target.value.trim() === "" ? NaN : Number(e.target.value))} />
      </Field>
      <div className="hint">
        {savedDays > 0 ? (willDelete > 0 ? tr(`সংরক্ষিত সেটিং (${bn(savedDays)} দিন) অনুযায়ী এখন ${bn(willDelete)}টি কথোপকথন মোছার যোগ্য।`, `Under the saved setting (${savedDays} days), ${willDelete} conversations are eligible for deletion now.`) : tr(`সংরক্ষিত সেটিং (${bn(savedDays)} দিন) অনুযায়ী মোছার মতো কোনো কথোপকথন নেই।`, `Under the saved setting (${savedDays} days), no conversations are eligible for deletion.`)) : tr("বর্তমানে সব কথোপকথন চিরকাল রাখা হচ্ছে।", "All conversations are currently kept forever.")}
      </div>
      <div>
        <button type="button" className="btn btn-outline" disabled={willDelete === 0} onClick={() => setConfirm(true)}>
          {tr("এখনই পরিষ্কার করুন", "Clean up now")}
        </button>
      </div>
      <ConfirmModal
        open={confirm}
        title={tr("পুরনো কথোপকথন মুছে ফেলবেন?", "Delete old conversations?")}
        body={tr(`${bn(willDelete)}টি কথোপকথন স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে না। (হস্তান্তরের রেকর্ড থাকবে, শুধু প্রতিলিপি মুছবে।)`, `${willDelete} conversations will be permanently deleted. This cannot be undone. (Hand-off records stay; only transcripts are removed.)`)}
        confirmLabel={tr("মুছে ফেলুন", "Delete")}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          try {
            const r = await api<{ deleted: number }>("/api/admin/data/purge", { body: {} });
            await mutate();
            setNotice({ kind: "ok", text: tr(`${bn(r.deleted)}টি পুরনো কথোপকথন মুছে ফেলা হয়েছে।`, `${r.deleted} old conversations were deleted.`) });
          } catch (e) {
            setNotice({ kind: "err", text: errorMessage(e) });
          }
        }}
      />
    </div>
  );
}

function DataPanel({ setNotice, onReplaced }: { setNotice: (n: Notice) => void; onReplaced: () => Promise<void> }) {
  const { tr } = useApp();
  const { data: stats, mutate } = useSWR<DataStats>("/api/admin/data/stats", fetcher);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <section className="card card-pad">
        <h2 className="card-title">{tr("ব্যাকআপ ও পুনরুদ্ধার", "Backup & restore")}</h2>
        <div className="stack">
          <p className="hint">
            {tr(`সব তথ্য MongoDB ডাটাবেসে সংরক্ষিত${stats ? `: ${bn(stats.conversations)}টি কথোপকথন, ${bn(stats.escalations)}টি হস্তান্তর, ${bn(stats.kb)}টি নলেজ বেস এন্ট্রি` : ""}। ব্যাকআপ ফাইলে সদস্যদের অ্যাকাউন্ট বা পাসওয়ার্ড থাকে না, কিন্তু নাগরিকদের কথোপকথন থাকে — নিরাপদ স্থানে রাখুন।`, `All data is stored in the MongoDB database${stats ? `: ${stats.conversations} conversations, ${stats.escalations} hand-offs, ${stats.kb} knowledge-base entries` : ""}. Backup files do not contain member accounts or passwords, but they do contain citizens' conversations — keep them somewhere safe.`)}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn btn-solid" href="/api/admin/data/export" download>
              {tr("ব্যাকআপ ডাউনলোড (JSON)", "Download backup (JSON)")}
            </a>
            <button type="button" className="btn btn-outline" onClick={() => fileRef.current?.click()}>
              {tr("ব্যাকআপ থেকে পুনরুদ্ধার…", "Restore from backup…")}
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
        <h2 className="card-title">{tr("বিপজ্জনক এলাকা", "Danger zone")}</h2>
        <p className="hint" style={{ marginBottom: 12 }}>{tr("সব কথোপকথন, হস্তান্তর, নলেজ বেস ও সেটিংস মুছে প্রাথমিক ডেমো ডেটায় ফিরে যাবে (সদস্যদের অ্যাকাউন্ট থাকবে)। আগে ব্যাকআপ নিয়ে রাখুন।", "This deletes all conversations, hand-offs, knowledge base and settings and returns to the initial demo data (member accounts stay). Take a backup first.")}</p>
        {stats?.resetAllowed === false ? (
          <p className="hint">{tr("এই সার্ভারে ডেমো ডেটায় রিসেট বন্ধ করা আছে (প্রোডাকশন সুরক্ষা), যাতে বাস্তব তথ্য ভুলবশত মুছে না যায়।", "Resetting to demo data is disabled on this server (production safeguard) so real data cannot be wiped by mistake.")}</p>
        ) : (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>
            {tr("ডেমো ডেটায় রিসেট করুন", "Reset to demo data")}
          </button>
        )}
      </section>

      <ConfirmModal
        open={pendingImport !== null}
        title={tr("ব্যাকআপ থেকে পুনরুদ্ধার করবেন?", "Restore from backup?")}
        body={tr("বর্তমান সব কথোপকথন, হস্তান্তর, নলেজ বেস ও সেটিংস ব্যাকআপ ফাইলের তথ্য দিয়ে প্রতিস্থাপিত হবে।", "All current conversations, hand-offs, knowledge base and settings will be replaced with the data in the backup file.")}
        confirmLabel={tr("পুনরুদ্ধার করুন", "Restore")}
        onCancel={() => setPendingImport(null)}
        onConfirm={async () => {
          const text = pendingImport;
          setPendingImport(null);
          try {
            const res = await fetch("/api/admin/data/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text ?? "" });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? tr("পুনরুদ্ধার ব্যর্থ হয়েছে।", "Restore failed."));
            await mutate();
            await onReplaced();
            setNotice({ kind: "ok", text: tr("ব্যাকআপ থেকে সফলভাবে পুনরুদ্ধার করা হয়েছে।", "Restored from backup successfully.") });
          } catch (e) {
            setNotice({ kind: "err", text: errorMessage(e) });
          }
        }}
      />
      <ConfirmModal
        open={confirmReset}
        danger
        title={tr("সব তথ্য রিসেট করবেন?", "Reset all data?")}
        body={tr("বর্তমান সব কথোপকথন, হস্তান্তর, নলেজ বেস এন্ট্রি ও সেটিংস মুছে যাবে এবং ডেমো ডেটা ফিরে আসবে। এটি ফেরানো যাবে না।", "All conversations, hand-offs, knowledge-base entries and settings will be deleted and the demo data restored. This cannot be undone.")}
        confirmLabel={tr("হ্যাঁ, রিসেট করুন", "Yes, reset")}
        confirmWord={tr("রিসেট", "RESET")}
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          setConfirmReset(false);
          try {
            await api("/api/admin/data/reset", { body: { confirm: "RESET" } });
            await mutate();
            await onReplaced();
            setNotice({ kind: "ok", text: tr("সব তথ্য ডেমো ডেটায় রিসেট করা হয়েছে।", "All data was reset to demo data.") });
          } catch (e) {
            setNotice({ kind: "err", text: errorMessage(e) });
          }
        }}
      />
    </>
  );
}

function ConfirmModal({ open, title, body, confirmLabel, danger, confirmWord, onConfirm, onCancel }: { open: boolean; title: string; body: string; confirmLabel: string; danger?: boolean; confirmWord?: string; onConfirm: () => void; onCancel: () => void }) {
  const { tr } = useApp();
  const [typed, setTyped] = useState("");
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p>{body}</p>
      {confirmWord && (
        <label className="field">
          {tr(`নিশ্চিত করতে নিচে “${confirmWord}” লিখুন`, `Type “${confirmWord}” below to confirm`)}
          <input type="text" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-outline" onClick={() => { setTyped(""); onCancel(); }} data-autofocus>
          {tr("বাতিল", "Cancel")}
        </button>
        <button type="button" className={danger ? "btn btn-danger" : "btn btn-solid"} disabled={!!confirmWord && typed.trim() !== confirmWord} onClick={() => { setTyped(""); onConfirm(); }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- audit log (admin) ---------------- */

interface AuditRow {
  id: string;
  at: string;
  actorName: string;
  action: string;
  detail?: string;
}

const ACTION_LABEL: Record<string, [string, string]> = {
  "auth.login": ["লগইন", "Login"],
  "auth.login_locked": ["লগইন লক", "Login locked"],
  "auth.password_change": ["পাসওয়ার্ড পরিবর্তন", "Password change"],
  "auth.logout_all": ["সব ডিভাইস থেকে লগআউট", "Logout of all devices"],
  "team.create": ["সদস্য যোগ", "Member added"],
  "team.update": ["সদস্য পরিবর্তন", "Member changed"],
  "team.password_reset": ["পাসওয়ার্ড রিসেট", "Password reset"],
  "settings.update": ["সেটিংস পরিবর্তন", "Settings changed"],
  "data.export": ["ব্যাকআপ ডাউনলোড", "Backup downloaded"],
  "data.import": ["ব্যাকআপ পুনরুদ্ধার", "Backup restored"],
  "data.reset": ["ডেমো রিসেট", "Demo reset"],
  "data.purge": ["পুরনো চ্যাট মোছা", "Old chats deleted"],
  "conversation.delete": ["কথোপকথন মোছা", "Conversation deleted"],
  "kb.create": ["নলেজ বেস: যোগ", "Knowledge base: added"],
  "kb.update": ["নলেজ বেস: পরিবর্তন", "Knowledge base: changed"],
  "kb.delete": ["নলেজ বেস: মোছা", "Knowledge base: deleted"],
};

function AuditPanel() {
  const { tr } = useApp();
  const [page, setPage] = useState(0);
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");
  const { data } = useSWR<{ total: number; pageSize: number; items: AuditRow[] }>(`/api/admin/audit?page=${page}&action=${encodeURIComponent(action)}&q=${encodeURIComponent(q)}`, fetcher, { refreshInterval: 15_000, keepPreviousData: true });
  const total = data?.total ?? 0;
  const size = data?.pageSize ?? 25;
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <section className="card">
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <h2 className="card-title">{tr("অডিট লগ", "Audit log")}</h2>
        <p className="hint" style={{ marginBottom: 12 }}>{tr("কে কখন কী পরিবর্তন করেছেন তার স্থায়ী রেকর্ড (প্রায় ১৩ মাস রাখা হয়)। পাসওয়ার্ড বা গোপন তথ্য এখানে কখনো লেখা হয় না।", "A permanent record of who changed what and when (kept for about 13 months). Passwords and secrets are never written here.")}</p>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <select className="input" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} aria-label={tr("কাজের ধরন", "Action type")}>
            <option value="all">{tr("সব কাজ", "All actions")}</option>
            <option value="auth.*">{tr("লগইন ও পাসওয়ার্ড", "Login & password")}</option>
            <option value="team.*">{tr("টিম", "Team")}</option>
            <option value="settings.update">{tr("সেটিংস", "Settings")}</option>
            <option value="data.*">{tr("ডেটা (ব্যাকআপ/রিসেট/মোছা)", "Data (backup/reset/delete)")}</option>
            <option value="kb.*">{tr("নলেজ বেস", "Knowledge base")}</option>
            <option value="conversation.delete">{tr("কথোপকথন মোছা", "Conversation deleted")}</option>
          </select>
          <input type="search" className="input" style={{ width: 240 }} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={tr("নাম বা বিবরণ খুঁজুন...", "Search name or details...")} aria-label={tr("অডিট খুঁজুন", "Search audit log")} />
        </div>
      </div>
      <div className="table-wrap">
        <table className="compact-first" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>{tr("সময়", "Time")}</th>
              <th>{tr("কে", "Who")}</th>
              <th>{tr("কাজ", "Action")}</th>
              <th>{tr("বিবরণ", "Details")}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap", color: "var(--text-2)" }}>{fmtDateTime(r.at)}</td>
                <td style={{ fontWeight: 600 }}>{r.actorName}</td>
                <td>
                  <span className="badge" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
                    {ACTION_LABEL[r.action] ? tr(ACTION_LABEL[r.action][0], ACTION_LABEL[r.action][1]) : r.action}
                  </span>
                </td>
                <td style={{ color: "var(--text-2)", maxWidth: 420 }}>{r.detail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && total === 0 && <div className="empty">{tr("কোনো রেকর্ড পাওয়া যায়নি।", "No records found.")}</div>}
      {total > 0 && (
        <div className="pager">
          <div style={{ color: "var(--text-2)" }}>
            {tr(`${bn(total)}টির মধ্যে ${bn(page * size + 1)}–${bn(Math.min((page + 1) * size, total))}`, `${page * size + 1}–${Math.min((page + 1) * size, total)} of ${total}`)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" className="btn btn-outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {tr("← আগের", "← Previous")}
            </button>
            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
              {bn(page + 1)} / {bn(pages)}
            </span>
            <button type="button" className="btn btn-outline" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
              {tr("পরের →", "Next →")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
