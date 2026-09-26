"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useApp } from "./AppProvider";
import { Modal } from "./Modal";
import { KbFormModal } from "./KbFormModal";
import { Transcript } from "./Transcript";
import { api, download, errorMessage, fetcher, qs } from "@/lib/api";
import { useSettings, useTeam } from "@/lib/hooks";
import type { Settings } from "@/lib/settings";
import { localizeTopic, STATUS_META, type EscStatus, type Escalation, type KbInput, type Priority } from "@/lib/data";
import { bn, fmtDateTime, type Conversation } from "@/lib/conversations";
import { PRIORITY_META, fmtMinutes, isOverdue, timingLabel } from "@/lib/escalations";

type StatusFilter = "all" | EscStatus;
type Sort = "queue" | "new" | "old";

const PAGE_SIZE = 10;

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

interface ListResponse {
  items: Escalation[];
  total: number;
  page: number;
  baseTotal: number;
  stats: { counts: Record<EscStatus, number>; overdue: number; urgentOpen: number; avgResponse: number | null; avgResolution: number | null };
  depts: string[];
  slaMinutes: number;
  hours: Settings["hours"];
}
interface DetailResponse {
  escalation: Escalation;
  conversation: Conversation | null;
}

type Action =
  | { action: "accept" }
  | { action: "resolve"; resolution: string }
  | { action: "reopen" }
  | { action: "priority"; priority: Priority }
  | { action: "assign"; assignee: string | null }
  | { action: "note"; text: string }
  | { action: "reply"; text: string }
  | { action: "kbAdded" };

export function EscalationsView() {
  const { user, tr } = useApp();
  const me = user?.name ?? "";
  const searchParams = useSearchParams();
  const now = useNow(30_000);
  const { data: teamData } = useTeam();
  const team = teamData?.team ?? [];

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [dept, setDept] = useState("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [assignee, setAssignee] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<Sort>("queue");
  const [page, setPage] = useState(0);

  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("open"));
  const [kbDraft, setKbDraft] = useState<DetailResponse | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(id);
  }, [query]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const filt =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(0);
    };

  const listKey = `/api/admin/escalations${qs({ q: debounced, dept, priority, assignee, status, sort, page, pageSize: PAGE_SIZE })}`;
  const { data, mutate, isLoading } = useSWR<ListResponse>(listKey, fetcher, { refreshInterval: 8_000, keepPreviousData: true });
  const detailKey = openId ? `/api/admin/escalations/${openId}` : null;
  const { data: detail, mutate: mutateDetail } = useSWR<DetailResponse>(detailKey, fetcher, { refreshInterval: 4_000 });

  const sla = data?.slaMinutes ?? 15;
  const hours = data?.hours;
  const stats = data?.stats;
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const safePage = data?.page ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = query || dept !== "all" || priority !== "all" || assignee !== "all" || status !== "all";

  const resetFilters = () => {
    setQuery("");
    setDebounced("");
    setDept("all");
    setPriority("all");
    setAssignee("all");
    setStatus("all");
    setPage(0);
  };

  /** Runs a case action; on failure shows the server's message and refreshes (e.g. someone else got there first). */
  const act = async (id: string, body: Action): Promise<boolean> => {
    try {
      const res = await api<DetailResponse>(`/api/admin/escalations/${id}`, { body });
      await mutateDetail(res, { revalidate: false });
      await mutate();
      return true;
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
      await Promise.all([mutate(), mutateDetail()]);
      return false;
    }
  };

  const exportCsv = () => {
    download(`/api/admin/escalations/export${qs({ q: debounced, dept, priority, assignee, status, sort })}`);
    setNotice({ kind: "ok", text: tr(`${bn(total)}টি হস্তান্তর CSV হিসেবে ডাউনলোড হচ্ছে।`, `Downloading ${total} hand-offs as CSV.`) });
  };

  const saveKb = async (d: DetailResponse, input: KbInput) => {
    try {
      await api("/api/admin/kb", { body: input });
      await act(d.escalation.id, { action: "kbAdded" });
      setNotice({ kind: "ok", text: tr(`“${input.question}” নলেজ বেসে যোগ করা হয়েছে — পরের বার বট নিজেই উত্তর দিতে পারবে।`, `“${input.question}” was added to the knowledge base — the bot can answer it next time.`) });
      setKbDraft(null);
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const cards: { key: StatusFilter; label: string; color: string; value: number; sub?: string; subColor?: string }[] = [
    { key: "all", label: tr("মোট হস্তান্তর", "Total hand-offs"), color: "var(--accent)", value: data?.baseTotal ?? 0, sub: stats ? (stats.urgentOpen ? tr(`জরুরি খোলা: ${bn(stats.urgentOpen)}টি`, `Urgent open: ${stats.urgentOpen}`) : tr("কোনো জরুরি খোলা নেই", "No urgent cases open")) : undefined, subColor: stats?.urgentOpen ? "var(--danger)" : undefined },
    { key: "new", label: tr("নতুন", "New"), color: "var(--info)", value: stats?.counts.new ?? 0, sub: stats ? (stats.overdue ? tr(`${bn(stats.overdue)}টি ${bn(sla)} মিনিট SLA ছাড়িয়েছে`, `${stats.overdue} past the ${sla}-min SLA`) : tr("সবই SLA-র মধ্যে", "All within SLA")) : undefined, subColor: stats?.overdue ? "var(--danger)" : undefined },
    { key: "ongoing", label: tr("চলমান", "In progress"), color: "var(--warn)", value: stats?.counts.ongoing ?? 0, sub: stats?.avgResponse != null ? `${tr("গড় প্রথম সাড়া", "Avg. first response")}: ${fmtMinutes(stats.avgResponse)}` : undefined },
    { key: "resolved", label: tr("সমাধান হয়েছে", "Resolved"), color: "var(--success)", value: stats?.counts.resolved ?? 0, sub: stats?.avgResolution != null ? `${tr("গড় সমাধান সময়", "Avg. resolution time")}: ${fmtMinutes(stats.avgResolution)}` : undefined },
  ];

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>{tr("হস্তান্তরকৃত প্রশ্ন", "Handed-off questions")}</h1>
          <p>
            {tr(`যেসব প্রশ্নে নাগরিক মানব প্রতিনিধির সাহায্য চেয়েছেন। নতুন হস্তান্তর ${bn(sla)} মিনিটের মধ্যে গ্রহণ করুন, নাগরিককে উত্তর দিন এবং সমাধানের সারসংক্ষেপ লিখে বন্ধ করুন।`, `Questions where citizens asked for a human agent. Accept new hand-offs within ${sla} minutes, reply to the citizen, and close with a resolution summary.`)}
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={total === 0}>
          {tr("CSV এক্সপোর্ট", "Export CSV")}
        </button>
      </div>

      <div role="status" aria-live="polite" className="livereg">
        {notice && <div className={notice.kind === "ok" ? "notice" : "notice err"}>{notice.text}</div>}
      </div>

      <div className="stat-grid">
        {cards.map((s) => (
          <button key={s.key} type="button" className="statcard" aria-pressed={status === s.key} onClick={() => filt(setStatus)(s.key)}>
            <div className="label">{s.label}</div>
            <div className="num" style={{ color: s.color }}>
              {bn(s.value)}
            </div>
            {s.sub && (
              <div className="stat-sub" style={s.subColor ? { color: s.subColor } : undefined}>
                {s.sub}
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input type="search" className="input" style={{ width: 260 }} value={query} onChange={(e) => filt(setQuery)(e.target.value)} placeholder={tr("আইডি, প্রশ্ন বা নাগরিক খুঁজুন...", "Search ID, question or citizen...")} aria-label={tr("হস্তান্তর খুঁজুন", "Search hand-offs")} />
        <select className="input" value={dept} onChange={(e) => filt(setDept)(e.target.value)} aria-label={tr("বিভাগ", "Department")}>
          <option value="all">{tr("সব বিভাগ", "All departments")}</option>
          {(data?.depts ?? []).map((d) => (
            <option key={d} value={d}>
              {localizeTopic(d)}
            </option>
          ))}
        </select>
        <select className="input" value={priority} onChange={(e) => filt(setPriority)(e.target.value as "all" | Priority)} aria-label={tr("অগ্রাধিকার", "Priority")}>
          <option value="all">{tr("সব অগ্রাধিকার", "All priorities")}</option>
          <option value="urgent">{tr("জরুরি", "Urgent")}</option>
          <option value="normal">{tr("সাধারণ", "Normal")}</option>
        </select>
        <select className="input" value={assignee} onChange={(e) => filt(setAssignee)(e.target.value)} aria-label={tr("দায়িত্বপ্রাপ্ত", "Assignee")}>
          <option value="all">{tr("সবার হস্তান্তর", "Everyone's hand-offs")}</option>
          <option value="mine">{tr("আমার", "Mine")} ({me})</option>
          <option value="unassigned">{tr("কারও নয়", "Unassigned")}</option>
          {team
            .filter((m) => m.name !== me)
            .map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
                {m.active ? "" : tr(" (নিষ্ক্রিয়)", " (inactive)")}
              </option>
            ))}
        </select>
        <select className="input" value={sort} onChange={(e) => filt(setSort)(e.target.value as Sort)} aria-label={tr("সাজান", "Sort")}>
          <option value="queue">{tr("কাজের ক্রম (জরুরি আগে)", "Work queue (urgent first)")}</option>
          <option value="new">{tr("নতুন আগে", "Newest first")}</option>
          <option value="old">{tr("পুরনো আগে", "Oldest first")}</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="compact-first" style={{ minWidth: 880 }}>
            <thead>
              <tr>
                <th>{tr("আইডি / সময়", "ID / time")}</th>
                <th>{tr("প্রশ্ন", "Question")}</th>
                <th>{tr("নাগরিক / বিভাগ", "Citizen / department")}</th>
                <th>{tr("অগ্রাধিকার", "Priority")}</th>
                <th>{tr("দায়িত্বপ্রাপ্ত", "Assignee")}</th>
                <th>{tr("সময়", "Time")}</th>
                <th>{tr("স্ট্যাটাস", "Status")}</th>
                <th>{tr("অ্যাকশন", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const meta = STATUS_META[e.status];
                const pr = PRIORITY_META[e.priority];
                const timing = timingLabel(e, now, hours);
                const overdue = isOverdue(e, now, sla, hours);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600 }}>{e.id}</div>
                      <div style={{ color: "var(--text-2)", fontSize: 12 }}>{fmtDateTime(e.createdAt)}</div>
                    </td>
                    <td style={{ maxWidth: 280, minWidth: 200 }}>
                      <button type="button" className="rowlink" onClick={() => setOpenId(e.id)}>
                        {e.question}
                      </button>
                    </td>
                    <td>
                      <div>{e.citizen}</div>
                      <div style={{ color: "var(--text-2)", fontSize: 12 }}>{localizeTopic(e.dept)}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: pr.bg, color: pr.color }}>
                        {pr.label}
                      </span>
                    </td>
                    <td style={{ color: e.assignee ? "var(--text)" : "var(--text-3)" }}>{e.assignee ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ color: overdue ? "var(--danger)" : "var(--text)", fontWeight: overdue ? 700 : 500 }}>{timing.text}</div>
                      <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{overdue ? `${timing.prefix} · ${tr("SLA ছাড়িয়েছে", "past SLA")}` : timing.prefix}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {e.status === "new" ? (
                        <button
                          type="button"
                          className="btn btn-solid"
                          onClick={async () => {
                            if (await act(e.id, { action: "accept" })) setOpenId(e.id);
                          }}
                        >
                          {tr("গ্রহণ করুন", "Accept")}
                        </button>
                      ) : (
                        <button type="button" className="btn-link" onClick={() => setOpenId(e.id)}>
                          {e.status === "ongoing" ? tr("খুলুন →", "Open →") : tr("দেখুন →", "View →")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isLoading && !data && <div className="empty">{tr("লোড হচ্ছে…", "Loading…")}</div>}
        {data && total === 0 && (
          <div className="empty">
            <div>{filtersActive ? tr("এই ফিল্টারে কোনো হস্তান্তর পাওয়া যায়নি।", "No hand-offs match these filters.") : tr("এখনও কোনো হস্তান্তর নেই।", "No hand-offs yet.")}</div>
            {filtersActive && (
              <button type="button" className="btn btn-outline" onClick={resetFilters} style={{ marginTop: 10 }}>
                {tr("ফিল্টার মুছুন", "Clear filters")}
              </button>
            )}
          </div>
        )}

        {total > 0 && (
          <div className="pager">
            <div style={{ color: "var(--text-2)" }}>
              {tr(`${bn(total)}টির মধ্যে ${bn(safePage * PAGE_SIZE + 1)}–${bn(Math.min((safePage + 1) * PAGE_SIZE, total))}`, `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, total)} of ${total}`)}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="btn btn-outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                {tr("← আগের", "← Previous")}
              </button>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                {bn(safePage + 1)} / {bn(totalPages)}
              </span>
              <button type="button" className="btn btn-outline" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                {tr("পরের →", "Next →")}
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!openId} title={openId ? `${tr("হস্তান্তর", "Hand-off")} ${openId}` : ""} onClose={() => setOpenId(null)} wide>
        {!detail && <p className="hint">{tr("লোড হচ্ছে…", "Loading…")}</p>}
        {detail && (
          <EscalationDetail
            key={detail.escalation.id}
            esc={detail.escalation}
            conv={detail.conversation ?? undefined}
            now={now}
            sla={sla}
            hours={hours}
            team={team}
            onAct={(body) => act(detail.escalation.id, body)}
            onAddKb={() => {
              setOpenId(null);
              setKbDraft(detail);
            }}
            onClose={() => setOpenId(null)}
          />
        )}
      </Modal>

      {kbDraft && (
        <KbFormModal
          key={kbDraft.escalation.id}
          item={null}
          defaults={{ question: kbDraft.escalation.question, category: kbDraft.conversation?.topic ?? undefined, answer: kbDraft.escalation.resolution }}
          onClose={() => setKbDraft(null)}
          onSave={(input) => saveKb(kbDraft, input)}
        />
      )}
    </>
  );
}

function EscalationDetail({
  esc,
  conv,
  now,
  sla,
  hours,
  team,
  onAct,
  onAddKb,
  onClose,
}: {
  esc: Escalation;
  conv: Conversation | undefined;
  now: number;
  sla: number;
  hours?: Settings["hours"];
  team: { id: string; name: string; active: boolean }[];
  onAct: (body: Action) => Promise<boolean>;
  onAddKb: () => void;
  onClose: () => void;
}) {
  const { tr } = useApp();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState(esc.resolution);

  const meta = STATUS_META[esc.status];
  const timing = timingLabel(esc, now, hours);
  const overdue = isOverdue(esc, now, sla, hours);
  const { data: cfg } = useSettings();
  const templates = cfg?.settings.replyTemplates ?? [];
  
  return (
    <>
      <div className="esc-question">{esc.question}</div>

      <dl className="meta-grid">
        <div>
          <dt>{tr("স্ট্যাটাস", "Status")}</dt>
          <dd>
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </dd>
        </div>
        <div>
          <dt>{tr("অগ্রাধিকার", "Priority")}</dt>
          <dd>
            <select className="input" value={esc.priority} onChange={(e) => void onAct({ action: "priority", priority: e.target.value as Priority })} aria-label={tr("অগ্রাধিকার", "Priority")}>
              <option value="normal">{tr("সাধারণ", "Normal")}</option>
              <option value="urgent">{tr("জরুরি", "Urgent")}</option>
            </select>
          </dd>
        </div>
        <div>
          <dt>{tr("দায়িত্বপ্রাপ্ত", "Assignee")}</dt>
          <dd>
            <select className="input" value={esc.assignee ?? ""} onChange={(e) => void onAct({ action: "assign", assignee: e.target.value || null })} aria-label={tr("দায়িত্বপ্রাপ্ত", "Assignee")}>
              <option value="">{tr("কারও নয়", "Unassigned")}</option>
              {team
                .filter((m) => m.active || m.name === esc.assignee)
                .map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                    {m.active ? "" : tr(" (নিষ্ক্রিয়)", " (inactive)")}
                  </option>
                ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>{tr("নাগরিক", "Citizen")}</dt>
          <dd>{esc.citizen}</dd>
        </div>
        <div>
          <dt>{tr("বিভাগ", "Department")}</dt>
          <dd>{localizeTopic(esc.dept)}</dd>
        </div>
        <div>
          <dt>{timing.prefix}</dt>
          <dd style={overdue ? { color: "var(--danger)" } : undefined}>
            {timing.text}
            {overdue ? tr(" · SLA ছাড়িয়েছে", " · past SLA") : ""}
          </dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>{tr("কথোপকথন", "Conversation")}</dt>
          <dd>
            {conv ? (
              <Link href={`/admin/conversations?q=${conv.id}`} className="btn-link">
                {conv.id} — {tr("কথোপকথন লগে দেখুন →", "view in conversation log →")}
              </Link>
            ) : (
              tr("এই হস্তান্তরের সাথে কোনো কথোপকথন সংযুক্ত নেই", "No conversation is linked to this hand-off")
            )}
          </dd>
        </div>
      </dl>

      {conv && (
        <section aria-label={tr("কথোপকথন", "Conversation")}>
          <h3 className="sec-h">{tr("নাগরিকের সাথে কথোপকথন", "Conversation with the citizen")}</h3>
          <Transcript messages={conv.messages} maxHeight={260} />
        </section>
      )}

      {esc.status === "ongoing" && (
        <section>
          <h3 className="sec-h">{tr("নাগরিককে উত্তর দিন", "Reply to the citizen")}</h3>
          {conv ? (
            <form
              className="reply-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onAct({ action: "reply", text: reply })) setReply("");
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.length > 0 && (
                <select className="input" value="" aria-label={tr("সংরক্ষিত উত্তর", "Saved replies")} onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) setReply((cur) => (cur.trim() ? `${cur}\n${t.text}` : t.text)); }}>
                  <option value="">{tr("সংরক্ষিত উত্তর ঢোকান…", "Insert a saved reply…")}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}
              <textarea className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tr("আপনার উত্তর লিখুন — নাগরিকের চ্যাটে সঙ্গে সঙ্গে দেখা যাবে...", "Write your reply — it appears in the citizen's chat right away...")} aria-label={tr("নাগরিককে উত্তর", "Reply to the citizen")} />
              </div>
              <button type="submit" className="btn btn-solid" disabled={!reply.trim()}>
                {tr("পাঠান", "Send")}
              </button>
            </form>
          ) : (
            <p className="hint">{tr("কথোপকথন সংযুক্ত না থাকায় এখান থেকে উত্তর পাঠানো যাবে না।", "No conversation is linked, so replies cannot be sent from here.")}</p>
          )}
        </section>
      )}
      {esc.status === "new" && <p className="hint">{tr("নাগরিককে উত্তর দিতে আগে হস্তান্তরটি গ্রহণ করুন।", "Accept the hand-off before replying to the citizen.")}</p>}

      <section>
        <h3 className="sec-h">{tr("ইতিহাস ও নোট", "History & notes")}</h3>
        <ol className="timeline">
          {esc.activity.map((a, i) => (
            <li key={i} className={a.kind === "note" ? "note" : undefined}>
              <span className="tl-time">{fmtDateTime(a.at)}</span>
              <span>
                {a.kind === "note" && <strong>{tr("অভ্যন্তরীণ নোট", "Internal note")}{a.by ? ` (${a.by})` : ""}: </strong>}
                {a.text}
              </span>
            </li>
          ))}
        </ol>
        <form
          className="reply-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onAct({ action: "note", text: note })) setNote("");
          }}
        >
          <input type="text" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("অভ্যন্তরীণ নোট যোগ করুন (নাগরিক দেখবেন না)", "Add an internal note (the citizen will not see it)")} aria-label={tr("অভ্যন্তরীণ নোট", "Internal note")} />
          <button type="submit" className="btn btn-outline" disabled={!note.trim()}>
            {tr("নোট যোগ করুন", "Add note")}
          </button>
        </form>
      </section>

      {esc.status === "ongoing" && (
        <section>
          <h3 className="sec-h">{tr("সমাধান", "Resolution")}</h3>
          <textarea className="input" style={{ width: "100%" }} rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder={tr("কীভাবে সমাধান করা হলো তা লিখুন (বন্ধ করতে বাধ্যতামূলক)", "Describe how it was resolved (required to close)")} aria-label={tr("সমাধানের সারসংক্ষেপ", "Resolution summary")} />
        </section>
      )}
      {esc.status === "resolved" && (
        <section>
          <h3 className="sec-h">{tr("সমাধানের সারসংক্ষেপ", "Resolution summary")}</h3>
          <p className="resolution">{esc.resolution || tr("কোনো সারসংক্ষেপ লেখা হয়নি।", "No summary was written.")}</p>
        </section>
      )}

      <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {esc.status === "new" && (
            <button type="button" className="btn btn-solid" onClick={() => void onAct({ action: "accept" })}>
              {tr("গ্রহণ করুন", "Accept")}
            </button>
          )}
          {esc.status === "ongoing" && (
            <button type="button" className="btn btn-solid" disabled={!resolution.trim()} onClick={() => void onAct({ action: "resolve", resolution })}>
              {tr("সমাধান হিসেবে চিহ্নিত করুন", "Mark as resolved")}
            </button>
          )}
          {esc.status === "resolved" && (
            <>
              <button type="button" className="btn btn-outline" onClick={() => void onAct({ action: "reopen" })}>
                {tr("পুনরায় খুলুন", "Reopen")}
              </button>
              {esc.kbAdded ? (
                <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)", alignSelf: "center" }}>
                  {tr("নলেজ বেসে যোগ করা হয়েছে", "Added to knowledge base")}
                </span>
              ) : (
                <button type="button" className="btn btn-outline" onClick={onAddKb}>
                  {tr("নলেজ বেসে যোগ করুন", "Add to knowledge base")}
                </button>
              )}
            </>
          )}
        </div>
        <button type="button" className="btn btn-outline" onClick={onClose} data-autofocus>
          {tr("বন্ধ করুন", "Close")}
        </button>
      </div>
    </>
  );
}
