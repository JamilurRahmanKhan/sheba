"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { useApp } from "./AppProvider";
import { Modal } from "./Modal";
import { KbFormModal } from "./KbFormModal";
import { Transcript } from "./Transcript";
import { api, download, errorMessage, fetcher, qs } from "@/lib/api";
import { FAQ_TOPICS, labelFor, STATUS_META, type Escalation, type KbInput, type TopicId } from "@/lib/data";
import {
  OUTCOME_META,
  bn,
  deriveOutcome,
  durationSeconds,
  fmtDateTime,
  fmtDuration,
  topicLabel,
  type Conversation,
  type ConversationSummary,
  type Outcome,
  type Period,
} from "@/lib/conversations";

type OutcomeFilter = "all" | Outcome;
type TopicFilter = "all" | "none" | TopicId;
type ReviewFilter = "all" | "pending" | "done" | "flagged";
type Sort = "new" | "old" | "long" | "rating";

const PAGE_SIZE = 10;

const PERIODS: { id: Period; bn: string; en: string }[] = [
  { id: "all", bn: "সব সময়", en: "All time" },
  { id: "today", bn: "আজ", en: "Today" },
  { id: "7d", bn: "গত ৭ দিন", en: "Last 7 days" },
  { id: "30d", bn: "গত ৩০ দিন", en: "Last 30 days" },
];

interface ListResponse {
  items: ConversationSummary[];
  total: number;
  page: number;
  baseTotal: number;
  counts: Record<Outcome, number>;
  ratedCount: number;
  satisfiedCount: number;
  avgRating: number | null;
  pendingReview: number;
}
interface DetailResponse {
  conversation: Conversation;
  escalation: Escalation | null;
}

const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z" />
  </svg>
);

function Rating({ value }: { value?: number }) {
  const { tr } = useApp();
  if (!value) return <span style={{ color: "var(--text-3)" }}>—</span>;
  const color = value >= 4 ? "var(--success)" : value <= 2 ? "var(--danger)" : "var(--warn)";
  return (
    <span className="rating" style={{ color }} aria-label={`${tr("রেটিং", "Rating")} ${bn(value)} / ${bn(5)}`}>
      <StarIcon />
      {bn(value)}
    </span>
  );
}

const summaryTopic = (c: ConversationSummary) => topicLabel({ topic: c.topic } as Conversation);

export function ConversationsView() {
  const { user, tr } = useApp();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [topic, setTopic] = useState<TopicFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [review, setReview] = useState<ReviewFilter>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [page, setPage] = useState(0);

  const [openId, setOpenId] = useState<string | null>(null);
  const [kbDraft, setKbDraft] = useState<Conversation | null>(null);
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

  const listKey = `/api/admin/conversations${qs({ q: debounced, topic, outcome, period, review, sort, page, pageSize: PAGE_SIZE })}`;
  const { data, mutate, isLoading } = useSWR<ListResponse>(listKey, fetcher, { refreshInterval: 10_000, keepPreviousData: true });
  const detailKey = openId ? `/api/admin/conversations/${openId}` : null;
  const { data: detail, mutate: mutateDetail } = useSWR<DetailResponse>(detailKey, fetcher, { refreshInterval: 5_000 });

  const rows = data?.items ?? [];
  const counts = data?.counts ?? { resolved: 0, escalated: 0, unanswered: 0 };
  const baseTotal = data?.baseTotal ?? 0;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = data?.page ?? 0;
  const filtersActive = query || topic !== "all" || outcome !== "all" || period !== "all" || review !== "all";

  const resetFilters = () => {
    setQuery("");
    setDebounced("");
    setTopic("all");
    setOutcome("all");
    setPeriod("all");
    setReview("all");
    setPage(0);
  };

  const exportCsv = () => {
    download(`/api/admin/conversations/export${qs({ q: debounced, topic, outcome, period, review, sort })}`);
    setNotice({ kind: "ok", text: tr(`${bn(total)}টি কথোপকথন CSV হিসেবে ডাউনলোড হচ্ছে।`, `Downloading ${total} conversations as CSV.`) });
  };

  const patchConv = async (id: string, patch: Partial<Pick<Conversation, "reviewed" | "flagged" | "note" | "kbAdded">>) => {
    try {
      await api(`/api/admin/conversations/${id}`, { method: "PATCH", body: patch });
      await Promise.all([mutate(), mutateDetail()]);
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const removeConv = async (id: string) => {
    try {
      await api(`/api/admin/conversations/${id}`, { method: "DELETE" });
      setDeleteId(null);
      setOpenId(null);
      setNotice({ kind: "ok", text: tr(`${id} স্থায়ীভাবে মুছে ফেলা হয়েছে।`, `${id} was permanently deleted.`) });
      await mutate();
    } catch (e) {
      setDeleteId(null);
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const saveToKb = async (conv: Conversation, input: KbInput) => {
    try {
      await api("/api/admin/kb", { body: input });
      await api(`/api/admin/conversations/${conv.id}`, { method: "PATCH", body: { kbAdded: true, reviewed: true } });
      setNotice({ kind: "ok", text: tr(`“${input.question}” নলেজ বেসে যোগ করা হয়েছে এবং ${conv.id} রিভিউ হয়েছে হিসেবে চিহ্নিত হয়েছে। বট এখন থেকে এটি ব্যবহার করবে।`, `“${input.question}” was added to the knowledge base and ${conv.id} was marked reviewed. The bot will use it from now on.`) });
      setKbDraft(null);
      await mutate();
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const cards: { key: OutcomeFilter; label: string; color: string; value: number }[] = [
    { key: "all", label: tr("মোট কথোপকথন", "Total conversations"), color: "var(--accent)", value: baseTotal },
    { key: "resolved", label: tr("বট উত্তর দিয়েছে", "Bot answered"), color: "var(--success)", value: counts.resolved },
    { key: "escalated", label: tr("মানব প্রতিনিধিতে হস্তান্তর", "Handed to a human agent"), color: "var(--warn)", value: counts.escalated },
    { key: "unanswered", label: tr("উত্তর পাওয়া যায়নি", "Unanswered"), color: "var(--danger)", value: counts.unanswered },
  ];

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>{tr("কথোপকথন লগ", "Conversation log")}</h1>
          <p>
            {tr("নাগরিকদের সাথে বটের সব কথোপকথন দেখুন, যাচাই করুন এবং উত্তর না পাওয়া প্রশ্ন থেকে নলেজ বেস উন্নত করুন।", "Browse all bot conversations with citizens, review them, and improve the knowledge base from unanswered questions.")}
            {data && data.pendingReview > 0 ? tr(` রিভিউ বাকি: ${bn(data.pendingReview)}টি।`, ` Pending review: ${data.pendingReview}.`) : ""}
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
          <button key={s.key} type="button" className="statcard" aria-pressed={outcome === s.key} onClick={() => filt(setOutcome)(s.key)}>
            <div className="label">{s.label}</div>
            <div className="num" style={{ color: s.color }}>
              {bn(s.value)}
            </div>
            {s.key !== "all" && <div className="stat-sub">{baseTotal ? `${bn(Math.round((s.value / baseTotal) * 100))}%` : "—"}</div>}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input type="search" className="input" style={{ width: 260 }} value={query} onChange={(e) => filt(setQuery)(e.target.value)} placeholder={tr("আইডি, প্রশ্ন বা নোট খুঁজুন...", "Search ID, question or note...")} aria-label={tr("কথোপকথন খুঁজুন", "Search conversations")} />
        <select className="input" value={topic} onChange={(e) => filt(setTopic)(e.target.value as TopicFilter)} aria-label={tr("বিষয়", "Topic")}>
          <option value="all">{tr("সব বিষয়", "All topics")}</option>
          {FAQ_TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {labelFor(t.id)}
            </option>
          ))}
          <option value="none">{tr("অনির্ধারিত", "Unclassified")}</option>
        </select>
        <select className="input" value={period} onChange={(e) => filt(setPeriod)(e.target.value as Period)} aria-label={tr("সময়কাল", "Period")}>
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {tr(p.bn, p.en)}
            </option>
          ))}
        </select>
        <select className="input" value={review} onChange={(e) => filt(setReview)(e.target.value as ReviewFilter)} aria-label={tr("রিভিউ অবস্থা", "Review status")}>
          <option value="all">{tr("সব রিভিউ অবস্থা", "All review statuses")}</option>
          <option value="pending">{tr("রিভিউ বাকি", "Pending review")}</option>
          <option value="done">{tr("রিভিউ হয়েছে", "Reviewed")}</option>
          <option value="flagged">{tr("ফ্ল্যাগ করা", "Flagged")}</option>
        </select>
        <select className="input" value={sort} onChange={(e) => filt(setSort)(e.target.value as Sort)} aria-label={tr("সাজান", "Sort")}>
          <option value="new">{tr("নতুন আগে", "Newest first")}</option>
          <option value="old">{tr("পুরনো আগে", "Oldest first")}</option>
          <option value="long">{tr("বেশি বার্তা আগে", "Most messages first")}</option>
          <option value="rating">{tr("কম রেটিং আগে", "Lowest rating first")}</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="compact-first">
            <thead>
              <tr>
                <th>{tr("আইডি / সময়", "ID / time")}</th>
                <th>{tr("প্রথম প্রশ্ন", "First question")}</th>
                <th>{tr("বিষয়", "Topic")}</th>
                <th>{tr("প্রশ্ন", "Questions")}</th>
                <th>{tr("ফলাফল", "Outcome")}</th>
                <th>{tr("রেটিং", "Rating")}</th>
                <th>{tr("রিভিউ", "Review")}</th>
                <th>{tr("অ্যাকশন", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const meta = OUTCOME_META[c.outcome];
                return (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600 }}>{c.id}</div>
                      <div style={{ color: "var(--text-2)", fontSize: 12 }}>{fmtDateTime(c.startedAt)}</div>
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      <button type="button" className="rowlink" onClick={() => setOpenId(c.id)}>
                        {c.firstQuestion || "—"}
                      </button>
                    </td>
                    <td style={{ color: "var(--text-2)" }}>{summaryTopic(c)}</td>
                    <td>{bn(c.userMessages)}</td>
                    <td>
                      <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <Rating value={c.rating} />
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="badge" style={{ background: c.reviewed ? "var(--success-soft)" : "var(--surface-2)", color: c.reviewed ? "var(--success)" : "var(--text-2)" }}>
                          {c.reviewed ? tr("হয়েছে", "Done") : tr("বাকি", "Pending")}
                        </span>
                        {c.flagged && (
                          <span className="badge" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                            {tr("ফ্ল্যাগ", "Flagged")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn-link" onClick={() => setOpenId(c.id)}>
                        {tr("দেখুন →", "View →")}
                      </button>
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
            <div>{filtersActive ? tr("এই ফিল্টারে কোনো কথোপকথন পাওয়া যায়নি।", "No conversations match these filters.") : tr("এখনও কোনো কথোপকথন নেই।", "No conversations yet.")}</div>
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
              {data && data.ratedCount > 0 && data.avgRating !== null && ` · ${tr("গড় রেটিং", "Average rating")} ${bn(data.avgRating, 1)} / ${bn(5)} · ${tr("সন্তুষ্ট (৪–৫ স্টার)", "Satisfied (4–5 stars)")}: ${bn(Math.round((data.satisfiedCount / data.ratedCount) * 100))}% (${bn(data.ratedCount)} ${tr("টি রেটিং", "ratings")})`}
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

      <Modal open={!!openId} title={openId ? `${tr("কথোপকথন", "Conversation")} ${openId}` : ""} onClose={() => setOpenId(null)} wide>
        {!detail && <p className="hint">{tr("লোড হচ্ছে…", "Loading…")}</p>}
        {detail && (
          <ConversationDetail
            key={detail.conversation.id}
            conv={detail.conversation}
            escalation={detail.escalation ?? undefined}
            onUpdate={(patch) => patchConv(detail.conversation.id, patch)}
            onAddKb={() => {
              setOpenId(null);
              setKbDraft(detail.conversation);
            }}
            onClose={() => setOpenId(null)}
            onDelete={user?.role === "admin" ? () => setDeleteId(detail.conversation.id) : undefined}
          />
        )}
      </Modal>

      <Modal open={!!deleteId} title={tr("কথোপকথন স্থায়ীভাবে মুছবেন?", "Permanently delete this conversation?")} onClose={() => setDeleteId(null)}>
        <p>{tr(`${deleteId} এবং এর সম্পূর্ণ প্রতিলিপি মুছে যাবে। এটি ফেরানো যাবে না।`, `${deleteId} and its full transcript will be deleted. This cannot be undone.`)}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setDeleteId(null)} data-autofocus>
            {tr("বাতিল", "Cancel")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => deleteId && removeConv(deleteId)}>
            {tr("হ্যাঁ, মুছুন", "Yes, delete")}
          </button>
        </div>
      </Modal>

      {kbDraft && (
        <KbFormModal
          key={kbDraft.id}
          item={null}
          defaults={{ question: kbDraft.messages.find((m) => m.role === "user")?.text ?? "", category: kbDraft.topic ?? undefined }}
          onClose={() => setKbDraft(null)}
          onSave={(input) => saveToKb(kbDraft, input)}
        />
      )}
    </>
  );
}

function ConversationDetail({
  conv,
  escalation,
  onUpdate,
  onAddKb,
  onClose,
  onDelete,
}: {
  conv: Conversation;
  escalation?: Escalation;
  onUpdate: (patch: Partial<Pick<Conversation, "reviewed" | "flagged" | "note" | "kbAdded">>) => void;
  onAddKb: () => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { tr } = useApp();
  const [note, setNote] = useState(conv.note);
  const outcome = deriveOutcome(conv);
  const meta = OUTCOME_META[outcome];
  const noteDirty = note.trim() !== conv.note;

  return (
    <>
      <dl className="meta-grid">
        <div>
          <dt>{tr("শুরুর সময়", "Started")}</dt>
          <dd>{fmtDateTime(conv.startedAt)}</dd>
        </div>
        <div>
          <dt>{tr("স্থায়িত্ব", "Duration")}</dt>
          <dd>{fmtDuration(durationSeconds(conv))}</dd>
        </div>
        <div>
          <dt>{tr("বিষয়", "Topic")}</dt>
          <dd>{topicLabel(conv)}</dd>
        </div>
        <div>
          <dt>{tr("ভাষা", "Language")}</dt>
          <dd>{conv.lang === "en" ? "English" : "বাংলা"}</dd>
        </div>
        <div>
          <dt>{tr("ফলাফল", "Outcome")}</dt>
          <dd>
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </dd>
        </div>
        <div>
          <dt>{tr("নাগরিকের রেটিং", "Citizen rating")}</dt>
          <dd>
            <Rating value={conv.rating} />
          </dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>{tr("নাগরিক", "Citizen")}</dt>
          <dd>
            {escalation ? (
              <>
                {escalation.citizen} · {tr("হস্তান্তর", "Hand-off")} {escalation.id}{" "}
                <span className="badge" style={{ background: STATUS_META[escalation.status].bg, color: STATUS_META[escalation.status].color }}>
                  {STATUS_META[escalation.status].label}
                </span>
              </>
            ) : conv.escalationId ? (
              `${tr("হস্তান্তর", "Hand-off")} ${conv.escalationId}`
            ) : (
              tr("বেনামী সেশন", "Anonymous session")
            )}
          </dd>
        </div>
      </dl>

      <Transcript messages={conv.messages} />

      <label className="field">
        {tr("অভ্যন্তরীণ নোট", "Internal note")}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("যেমন: কোন KB এন্ট্রি হালনাগাদ করা দরকার...", "e.g. which KB entry needs updating...")} />
      </label>

      <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" onClick={() => onUpdate({ reviewed: !conv.reviewed })}>
            {conv.reviewed ? tr("রিভিউ বাতিল করুন", "Unmark reviewed") : tr("রিভিউ হয়েছে ✓", "Mark reviewed ✓")}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onUpdate({ flagged: !conv.flagged })} aria-pressed={conv.flagged}>
            {conv.flagged ? tr("ফ্ল্যাগ সরান", "Remove flag") : tr("উন্নতির জন্য ফ্ল্যাগ করুন", "Flag for improvement")}
          </button>
          {onDelete && (
            <button type="button" className="btn btn-outline" style={{ color: "var(--danger)" }} onClick={onDelete}>
              {tr("মুছে ফেলুন", "Delete")}
            </button>
          )}
          {noteDirty && (
            <button type="button" className="btn btn-outline" onClick={() => onUpdate({ note: note.trim() })}>
              {tr("নোট সংরক্ষণ", "Save note")}
            </button>
          )}
          {outcome === "unanswered" &&
            (conv.kbAdded ? (
              <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)", alignSelf: "center" }}>
                {tr("নলেজ বেসে যোগ করা হয়েছে", "Added to knowledge base")}
              </span>
            ) : (
              <button type="button" className="btn btn-solid" onClick={onAddKb}>
                {tr("নলেজ বেসে যোগ করুন", "Add to knowledge base")}
              </button>
            ))}
        </div>
        <button type="button" className="btn btn-solid" onClick={onClose} data-autofocus>
          {tr("বন্ধ করুন", "Close")}
        </button>
      </div>
    </>
  );
}
