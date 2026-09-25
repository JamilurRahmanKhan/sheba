"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Modal } from "./Modal";
import { KbFormModal } from "./KbFormModal";
import { Transcript } from "./Transcript";
import { api, download, errorMessage, fetcher, qs } from "@/lib/api";
import { FAQ_TOPICS, STATUS_META, type Escalation, type KbInput, type TopicId } from "@/lib/data";
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

const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "সব সময়" },
  { id: "today", label: "আজ" },
  { id: "7d", label: "গত ৭ দিন" },
  { id: "30d", label: "গত ৩০ দিন" },
];

interface ListResponse {
  items: ConversationSummary[];
  total: number;
  page: number;
  baseTotal: number;
  counts: Record<Outcome, number>;
  ratedCount: number;
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
  if (!value) return <span style={{ color: "var(--text-3)" }}>—</span>;
  const color = value >= 4 ? "var(--success)" : value <= 2 ? "var(--danger)" : "var(--warn)";
  return (
    <span className="rating" style={{ color }} aria-label={`রেটিং ${bn(value)} / ৫`}>
      <StarIcon />
      {bn(value)}
    </span>
  );
}

const summaryTopic = (c: ConversationSummary) => topicLabel({ topic: c.topic } as Conversation);

export function ConversationsView() {
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
    setNotice({ kind: "ok", text: `${bn(total)}টি কথোপকথন CSV হিসেবে ডাউনলোড হচ্ছে।` });
  };

  const patchConv = async (id: string, patch: Partial<Pick<Conversation, "reviewed" | "flagged" | "note" | "kbAdded">>) => {
    try {
      await api(`/api/admin/conversations/${id}`, { method: "PATCH", body: patch });
      await Promise.all([mutate(), mutateDetail()]);
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const saveToKb = async (conv: Conversation, input: KbInput) => {
    try {
      await api("/api/admin/kb", { body: input });
      await api(`/api/admin/conversations/${conv.id}`, { method: "PATCH", body: { kbAdded: true, reviewed: true } });
      setNotice({ kind: "ok", text: `“${input.question}” নলেজ বেসে যোগ করা হয়েছে এবং ${conv.id} রিভিউ হয়েছে হিসেবে চিহ্নিত হয়েছে। বট এখন থেকে এটি ব্যবহার করবে।` });
      setKbDraft(null);
      await mutate();
    } catch (e) {
      setNotice({ kind: "err", text: errorMessage(e) });
    }
  };

  const cards: { key: OutcomeFilter; label: string; color: string; value: number }[] = [
    { key: "all", label: "মোট কথোপকথন", color: "var(--accent)", value: baseTotal },
    { key: "resolved", label: "AI সমাধান করেছে", color: "var(--success)", value: counts.resolved },
    { key: "escalated", label: "মানব প্রতিনিধিতে হস্তান্তর", color: "var(--warn)", value: counts.escalated },
    { key: "unanswered", label: "উত্তর পাওয়া যায়নি", color: "var(--danger)", value: counts.unanswered },
  ];

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>কথোপকথন লগ</h1>
          <p>
            নাগরিকদের সাথে বটের সব কথোপকথন দেখুন, যাচাই করুন এবং উত্তর না পাওয়া প্রশ্ন থেকে নলেজ বেস উন্নত করুন।
            {data && data.pendingReview > 0 ? ` রিভিউ বাকি: ${bn(data.pendingReview)}টি।` : ""}
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
        <input type="search" className="input" style={{ width: 260 }} value={query} onChange={(e) => filt(setQuery)(e.target.value)} placeholder="আইডি, প্রশ্ন বা নোট খুঁজুন..." aria-label="কথোপকথন খুঁজুন" />
        <select className="input" value={topic} onChange={(e) => filt(setTopic)(e.target.value as TopicFilter)} aria-label="বিষয়">
          <option value="all">সব বিষয়</option>
          {FAQ_TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          <option value="none">অনির্ধারিত</option>
        </select>
        <select className="input" value={period} onChange={(e) => filt(setPeriod)(e.target.value as Period)} aria-label="সময়কাল">
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="input" value={review} onChange={(e) => filt(setReview)(e.target.value as ReviewFilter)} aria-label="রিভিউ অবস্থা">
          <option value="all">সব রিভিউ অবস্থা</option>
          <option value="pending">রিভিউ বাকি</option>
          <option value="done">রিভিউ হয়েছে</option>
          <option value="flagged">ফ্ল্যাগ করা</option>
        </select>
        <select className="input" value={sort} onChange={(e) => filt(setSort)(e.target.value as Sort)} aria-label="সাজান">
          <option value="new">নতুন আগে</option>
          <option value="old">পুরনো আগে</option>
          <option value="long">বেশি বার্তা আগে</option>
          <option value="rating">কম রেটিং আগে</option>
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="compact-first">
            <thead>
              <tr>
                <th>আইডি / সময়</th>
                <th>প্রথম প্রশ্ন</th>
                <th>বিষয়</th>
                <th>বার্তা</th>
                <th>ফলাফল</th>
                <th>রেটিং</th>
                <th>রিভিউ</th>
                <th>অ্যাকশন</th>
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
                    <td>{bn(c.messageCount - 1)}</td>
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
                          {c.reviewed ? "হয়েছে" : "বাকি"}
                        </span>
                        {c.flagged && (
                          <span className="badge" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                            ফ্ল্যাগ
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <button type="button" className="btn-link" onClick={() => setOpenId(c.id)}>
                        দেখুন →
                      </button>
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
            <div>{filtersActive ? "এই ফিল্টারে কোনো কথোপকথন পাওয়া যায়নি।" : "এখনও কোনো কথোপকথন নেই।"}</div>
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
              {data && data.ratedCount > 0 && data.avgRating !== null && ` · গড় রেটিং ${bn(data.avgRating, 1)} / ৫`}
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

      <Modal open={!!openId} title={openId ? `কথোপকথন ${openId}` : ""} onClose={() => setOpenId(null)} wide>
        {!detail && <p className="hint">লোড হচ্ছে…</p>}
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
          />
        )}
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
}: {
  conv: Conversation;
  escalation?: Escalation;
  onUpdate: (patch: Partial<Pick<Conversation, "reviewed" | "flagged" | "note" | "kbAdded">>) => void;
  onAddKb: () => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(conv.note);
  const outcome = deriveOutcome(conv);
  const meta = OUTCOME_META[outcome];
  const noteDirty = note.trim() !== conv.note;

  return (
    <>
      <dl className="meta-grid">
        <div>
          <dt>শুরুর সময়</dt>
          <dd>{fmtDateTime(conv.startedAt)}</dd>
        </div>
        <div>
          <dt>স্থায়িত্ব</dt>
          <dd>{fmtDuration(durationSeconds(conv))}</dd>
        </div>
        <div>
          <dt>বিষয়</dt>
          <dd>{topicLabel(conv)}</dd>
        </div>
        <div>
          <dt>ভাষা</dt>
          <dd>{conv.lang === "en" ? "English" : "বাংলা"}</dd>
        </div>
        <div>
          <dt>ফলাফল</dt>
          <dd>
            <span className="badge" style={{ background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
          </dd>
        </div>
        <div>
          <dt>নাগরিকের রেটিং</dt>
          <dd>
            <Rating value={conv.rating} />
          </dd>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>নাগরিক</dt>
          <dd>
            {escalation ? (
              <>
                {escalation.citizen} · হস্তান্তর {escalation.id}{" "}
                <span className="badge" style={{ background: STATUS_META[escalation.status].bg, color: STATUS_META[escalation.status].color }}>
                  {STATUS_META[escalation.status].label}
                </span>
              </>
            ) : conv.escalationId ? (
              `হস্তান্তর ${conv.escalationId}`
            ) : (
              "বেনামী সেশন"
            )}
          </dd>
        </div>
      </dl>

      <Transcript messages={conv.messages} />

      <label className="field">
        অভ্যন্তরীণ নোট
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="যেমন: কোন KB এন্ট্রি হালনাগাদ করা দরকার..." />
      </label>

      <div className="modal-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline" onClick={() => onUpdate({ reviewed: !conv.reviewed })}>
            {conv.reviewed ? "রিভিউ বাতিল করুন" : "রিভিউ হয়েছে ✓"}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onUpdate({ flagged: !conv.flagged })} aria-pressed={conv.flagged}>
            {conv.flagged ? "ফ্ল্যাগ সরান" : "উন্নতির জন্য ফ্ল্যাগ করুন"}
          </button>
          {noteDirty && (
            <button type="button" className="btn btn-outline" onClick={() => onUpdate({ note: note.trim() })}>
              নোট সংরক্ষণ
            </button>
          )}
          {outcome === "unanswered" &&
            (conv.kbAdded ? (
              <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)", alignSelf: "center" }}>
                নলেজ বেসে যোগ করা হয়েছে
              </span>
            ) : (
              <button type="button" className="btn btn-solid" onClick={onAddKb}>
                নলেজ বেসে যোগ করুন
              </button>
            ))}
        </div>
        <button type="button" className="btn btn-solid" onClick={onClose} data-autofocus>
          বন্ধ করুন
        </button>
      </div>
    </>
  );
}
