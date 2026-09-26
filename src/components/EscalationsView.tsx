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
import { STATUS_META, type EscStatus, type Escalation, type KbInput, type Priority } from "@/lib/data";
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
  const { user } = useApp();
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
    setNotice({ kind: "ok", text: `${bn(total)}টি হস্তান্তর CSV হিসেবে ডাউনলোড হচ্ছে।` });
  };

  const saveKb = async (d: DetailResponse, input: KbInput) => {
    try {
      await api("/api/admin/kb", { body: input });
      await act(d.escalation.id, { action: "kbAdded" });
      setNotice({ kind: "ok", text: `“${input.question}” নলেজ বেসে যোগ করা হয়েছে — পরের বার বট নিজেই উত্তর দিতে পারবে।` });
      setKbDraft(null);
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const cards: { key: StatusFilter; label: string; color: string; value: number; sub?: string; subColor?: string }[] = [
    { key: "all", label: "মোট হস্তান্তর", color: "var(--accent)", value: data?.baseTotal ?? 0, sub: stats ? (stats.urgentOpen ? `জরুরি খোলা: ${bn(stats.urgentOpen)}টি` : "কোনো জরুরি খোলা নেই") : undefined, subColor: stats?.urgentOpen ? "var(--danger)" : undefined },
    { key: "new", label: "নতুন", color: "var(--info)", value: stats?.counts.new ?? 0, sub: stats ? (stats.overdue ? `${bn(stats.overdue)}টি ${bn(sla)} মিনিট SLA ছাড়িয়েছে` : "সবই SLA-র মধ্যে") : undefined, subColor: stats?.overdue ? "var(--danger)" : undefined },
    { key: "ongoing", label: "চলমান", color: "var(--warn)", value: stats?.counts.ongoing ?? 0, sub: stats?.avgResponse != null ? `গড় প্রথম সাড়া: ${fmtMinutes(stats.avgResponse)}` : undefined },
    { key: "resolved", label: "সমাধান হয়েছে", color: "var(--success)", value: stats?.counts.resolved ?? 0, sub: stats?.avgResolution != null ? `গড় সমাধান সময়: ${fmtMinutes(stats.avgResolution)}` : undefined },
  ];

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>হস্তান্তরকৃত প্রশ্ন</h1>
          <p>
            যেসব প্রশ্নে নাগরিক মানব প্রতিনিধির সাহায্য চেয়েছেন। নতুন হস্তান্তর {bn(sla)} মিনিটের মধ্যে গ্রহণ করুন, নাগরিককে উত্তর দিন এবং সমাধানের সারসংক্ষেপ লিখে বন্ধ করুন।
          </p>
        </div>
        <button type="button" className="btn btn-outline" onClick={exportCsv} disabled={total === 0}>
          CSV এক্সপোর্ট
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
        <input type="search" className="input" style={{ width: 260 }} value={query} onChange={(e) => filt(setQuery)(e.target.value)} placeholder="আইডি, প্রশ্ন বা নাগরিক খুঁজুন..." aria-label="হস্তান্তর খুঁজুন" />
        <select className="input" value={dept} onChange={(e) => filt(setDept)(e.target.value)} aria-label="বিভাগ">
          <option value="all">সব বিভাগ</option>
          {(data?.depts ?? []).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className="input" value={priority} onChange={(e) => filt(setPriority)(e.target.value as "all" | Priority)} aria-label="অগ্রাধিকার">
          <option value="all">সব অগ্রাধিকার</option>
          <option value="urgent">জরুরি</option>
          <option value="normal">সাধারণ</option>
        </select>
        <select className="input" value={assignee} onChange={(e) => filt(setAssignee)(e.target.value)} aria-label="দায়িত্বপ্রাপ্ত">
          <option value="all">সবার হস্তান্তর</option>
          <option value="mine">আমার ({me})</option>
          <option value="unassigned">কারও নয়</option>
          {team
            .filter((m) => m.name !== me)
            .map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
                {m.active ? "" : " (নিষ্ক্রিয়)"}
              </option>
            ))}
        </select>
        <select className="input" value={sort} onChange={(e) => filt(setSort)(e.target.value as Sort)} aria-label="সাজান">
          <option value="queue">কাজের ক্রম (জরুরি আগে)</option>
          <option value="new">নতুন আগে</option>
          <option value="old">পুরনো আগে</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="compact-first" style={{ minWidth: 880 }}>
            <thead>
              <tr>
                <th>আইডি / সময়</th>
                <th>প্রশ্ন</th>
                <th>নাগরিক / বিভাগ</th>
                <th>অগ্রাধিকার</th>
                <th>দায়িত্বপ্রাপ্ত</th>
                <th>সময়</th>
                <th>স্ট্যাটাস</th>
                <th>অ্যাকশন</th>
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
                      <div style={{ color: "var(--text-2)", fontSize: 12 }}>{e.dept}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: pr.bg, color: pr.color }}>
                        {pr.label}
                      </span>
                    </td>
                    <td style={{ color: e.assignee ? "var(--text)" : "var(--text-3)" }}>{e.assignee ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ color: overdue ? "var(--danger)" : "var(--text)", fontWeight: overdue ? 700 : 500 }}>{timing.text}</div>
                      <div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{overdue ? `${timing.prefix} · SLA ছাড়িয়েছে` : timing.prefix}</div>
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
                          গ্রহণ করুন
                        </button>
                      ) : (
                        <button type="button" className="btn-link" onClick={() => setOpenId(e.id)}>
                          {e.status === "ongoing" ? "খুলুন →" : "দেখুন →"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {isLoading && !data && <div className="empty">লোড হচ্ছে…</div>}
        {data && total === 0 && (
          <div className="empty">
            <div>{filtersActive ? "এই ফিল্টারে কোনো হস্তান্তর পাওয়া যায়নি।" : "এখনও কোনো হস্তান্তর নেই।"}</div>
            {filtersActive && (
              <button type="button" className="btn btn-outline" onClick={resetFilters} style={{ marginTop: 10 }}>
                ফিল্টার মুছুন
              </button>
            )}
          </div>
        )}

        {total > 0 && (
          <div className="pager">
            <div style={{ color: "var(--text-2)" }}>
              {bn(total)}টির মধ্যে {bn(safePage * PAGE_SIZE + 1)}–{bn(Math.min((safePage + 1) * PAGE_SIZE, total))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" className="btn btn-outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                ← আগের
              </button>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                {bn(safePage + 1)} / {bn(totalPages)}
              </span>
              <button type="button" className="btn btn-outline" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                পরের →
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!openId} title={openId ? `হস্তান্তর ${openId}` : ""} onClose={() => setOpenId(null)} wide>
        {!detail && <p className="hint">লোড হচ্ছে…</p>}
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
          <dt>স্ট্যাটাস</dt>
          <dd>
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </dd>
        </div>
        <div>
          <dt>অগ্রাধিকার</dt>
          <dd>
            <select className="input" value={esc.priority} onChange={(e) => void onAct({ action: "priority", priority: e.target.value as Priority })} aria-label="অগ্রাধিকার">
              <option value="normal">সাধারণ</option>
              <option value="urgent">জরুরি</option>
            </select>
          </dd>
        </div>
        <div>
          <dt>দায়িত্বপ্রাপ্ত</dt>
          <dd>
            <select className="input" value={esc.assignee ?? ""} onChange={(e) => void onAct({ action: "assign", assignee: e.target.value || null })} aria-label="দায়িত্বপ্রাপ্ত">
              <option value="">কারও নয়</option>
              {team
                .filter((m) => m.active || m.name === esc.assignee)
                .map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                    {m.active ? "" : " (নিষ্ক্রিয়)"}
                  </option>
                ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>নাগরিক</dt>
          <dd>{esc.citizen}</dd>
        </div>
        <div>
          <dt>বিভাগ</dt>
          <dd>{esc.dept}</dd>
        </div>
        <div>
          <dt>{timing.prefix}</dt>
          <dd style={overdue ? { color: "var(--danger)" } : undefined}>
            {timing.text}
            {overdue ? " · SLA ছাড়িয়েছে" : ""}
          </dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>কথোপকথন</dt>
          <dd>
            {conv ? (
              <Link href={`/admin/conversations?q=${conv.id}`} className="btn-link">
                {conv.id} — কথোপকথন লগে দেখুন →
              </Link>
            ) : (
              "এই হস্তান্তরের সাথে কোনো কথোপকথন সংযুক্ত নেই"
            )}
          </dd>
        </div>
      </dl>

      {conv && (
        <section aria-label="কথোপকথন">
          <h3 className="sec-h">নাগরিকের সাথে কথোপকথন</h3>
          <Transcript messages={conv.messages} maxHeight={260} />
        </section>
      )}

      {esc.status === "ongoing" && (
        <section>
          <h3 className="sec-h">নাগরিককে উত্তর দিন</h3>
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
                <select className="input" value="" aria-label="সংরক্ষিত উত্তর" onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) setReply((cur) => (cur.trim() ? `${cur}\n${t.text}` : t.text)); }}>
                  <option value="">সংরক্ষিত উত্তর ঢোকান…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              )}
              <textarea className="input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="আপনার উত্তর লিখুন — নাগরিকের চ্যাটে সঙ্গে সঙ্গে দেখা যাবে..." aria-label="নাগরিককে উত্তর" />
              </div>
              <button type="submit" className="btn btn-solid" disabled={!reply.trim()}>
                পাঠান
              </button>
            </form>
          ) : (
            <p className="hint">কথোপকথন সংযুক্ত না থাকায় এখান থেকে উত্তর পাঠানো যাবে না।</p>
          )}
        </section>
      )}
      {esc.status === "new" && <p className="hint">নাগরিককে উত্তর দিতে আগে হস্তান্তরটি গ্রহণ করুন।</p>}

      <section>
        <h3 className="sec-h">ইতিহাস ও নোট</h3>
        <ol className="timeline">
          {esc.activity.map((a, i) => (
            <li key={i} className={a.kind === "note" ? "note" : undefined}>
              <span className="tl-time">{fmtDateTime(a.at)}</span>
              <span>
                {a.kind === "note" && <strong>অভ্যন্তরীণ নোট{a.by ? ` (${a.by})` : ""}: </strong>}
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
          <input type="text" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="অভ্যন্তরীণ নোট যোগ করুন (নাগরিক দেখবেন না)" aria-label="অভ্যন্তরীণ নোট" />
          <button type="submit" className="btn btn-outline" disabled={!note.trim()}>
            নোট যোগ করুন
          </button>
        </form>
      </section>

      {esc.status === "ongoing" && (
        <section>
          <h3 className="sec-h">সমাধান</h3>
          <textarea className="input" style={{ width: "100%" }} rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="কীভাবে সমাধান করা হলো তা লিখুন (বন্ধ করতে বাধ্যতামূলক)" aria-label="সমাধানের সারসংক্ষেপ" />
        </section>
      )}
      {esc.status === "resolved" && (
        <section>
          <h3 className="sec-h">সমাধানের সারসংক্ষেপ</h3>
          <p className="resolution">{esc.resolution || "কোনো সারসংক্ষেপ লেখা হয়নি।"}</p>
        </section>
      )}

      <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {esc.status === "new" && (
            <button type="button" className="btn btn-solid" onClick={() => void onAct({ action: "accept" })}>
              গ্রহণ করুন
            </button>
          )}
          {esc.status === "ongoing" && (
            <button type="button" className="btn btn-solid" disabled={!resolution.trim()} onClick={() => void onAct({ action: "resolve", resolution })}>
              সমাধান হিসেবে চিহ্নিত করুন
            </button>
          )}
          {esc.status === "resolved" && (
            <>
              <button type="button" className="btn btn-outline" onClick={() => void onAct({ action: "reopen" })}>
                পুনরায় খুলুন
              </button>
              {esc.kbAdded ? (
                <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)", alignSelf: "center" }}>
                  নলেজ বেসে যোগ করা হয়েছে
                </span>
              ) : (
                <button type="button" className="btn btn-outline" onClick={onAddKb}>
                  নলেজ বেসে যোগ করুন
                </button>
              )}
            </>
          )}
        </div>
        <button type="button" className="btn btn-outline" onClick={onClose} data-autofocus>
          বন্ধ করুন
        </button>
      </div>
    </>
  );
}
