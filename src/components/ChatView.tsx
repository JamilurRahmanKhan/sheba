"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppProvider";
import { Modal } from "./Modal";
import { api, ApiClientError } from "@/lib/api";
import { usePublicConfig } from "@/lib/hooks";
import { bn, fmtClock, type LogMessage } from "@/lib/conversations";
import { localizeGreeting, localizeSystemText, localizeTopic, type Followup, type TopicId } from "@/lib/data";

/** A message as returned by /api/chat: `idx` is its position in the stored conversation. */
interface ChatMsg extends LogMessage {
  idx: number;
  followups?: Followup[];
}

interface Session {
  id: string;
  token: string;
}
interface Recent {
  id: string;
  token: string;
  title: string;
  at: string;
}

const SESSION_KEY = "seba.chat";
const RECENT_KEY = "seba.recent";
const POLL_MS = 4000;

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* best effort */
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Merge server messages into the list by `idx`, dropping optimistic placeholders. */
function merge(prev: ChatMsg[], incoming: ChatMsg[]): ChatMsg[] {
  const map = new Map<number, ChatMsg>();
  prev.filter((m) => m.idx >= 0).forEach((m) => map.set(m.idx, m));
  incoming.forEach((m) => map.set(m.idx, { ...map.get(m.idx), ...m }));
  return [...map.values()].sort((a, b) => a.idx - b.idx);
}

export function ChatView() {
  const { t, tr, lang } = useApp();
  const { data: config, mutate: refreshConfig } = usePublicConfig();

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [pending, setPending] = useState<string | null>(null); // optimistic user text
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [escOpen, setEscOpen] = useState(false);
  const [inHours, setInHours] = useState(true);
  const [escStatus, setEscStatus] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [startedAt, setStartedAt] = useState(() => new Date());

  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const countRef = useRef(0); // messages known to the server that we already hold
  const busyRef = useRef(false);

  const adopt = useCallback((s: Session | null) => {
    sessionRef.current = s;
    setSession(s);
    if (s) writeJson(SESSION_KEY, s);
    else localStorage.removeItem(SESSION_KEY);
  }, []);

  const apply = useCallback((incoming: ChatMsg[], total?: number) => {
    if (incoming.length) setMessages((prev) => merge(prev, incoming));
    if (typeof total === "number") countRef.current = Math.max(countRef.current, total);
  }, []);

  const loadSession = useCallback(
    async (s: Session) => {
      try {
        const r = await api<{ total: number; messages: ChatMsg[]; escalation: { status: string } | null; rating: number | null }>(`/api/chat/${s.id}?token=${encodeURIComponent(s.token)}&after=0`);
        countRef.current = 0;
        setMessages([]);
        apply(r.messages, r.total);
        adopt(s);
        setEscStatus(r.escalation?.status ?? null);
        setRating(r.rating);
        if (r.messages[0]) setStartedAt(new Date(r.messages[0].at));
      } catch {
        adopt(null); // expired / deleted
      }
    },
    [adopt, apply],
  );

  // Restore the conversation after a page refresh.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time restore from browser storage */
    setRecent(readJson<Recent[]>(RECENT_KEY, []));
    const s = readJson<Session | null>(SESSION_KEY, null);
    if (s?.id && s.token) void loadSession(s);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadSession]);

  // Poll for replies from a human representative and case status changes.
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const tick = async () => {
      const s = sessionRef.current;
      if (!s || busyRef.current || document.hidden) return;
      try {
        const r = await api<{ total: number; messages: ChatMsg[]; escalation: { status: string } | null; rating: number | null }>(`/api/chat/${s.id}?token=${encodeURIComponent(s.token)}&after=${countRef.current}`);
        if (stopped) return;
        apply(r.messages, r.total);
        setEscStatus(r.escalation?.status ?? null);
        if (r.rating) setRating(r.rating);
      } catch {
        /* transient; try again next tick */
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [session, apply]);

  const visible = useMemo(() => messages.filter((m) => m.idx !== 0), [messages]);
  const greeting = messages.find((m) => m.idx === 0)?.text ?? config?.greeting ?? "";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, typing, pending]);

  const rememberRecent = useCallback((s: Session, title: string) => {
    const list = readJson<Recent[]>(RECENT_KEY, []).filter((r) => r.id !== s.id);
    const next = [{ ...s, title: title.slice(0, 60), at: new Date().toISOString() }, ...list].slice(0, 5);
    writeJson(RECENT_KEY, next);
    setRecent(next);
  }, []);

  const send = useCallback(
    async (text: string, followup?: { topicId: TopicId; label: string }) => {
      const q = text.trim();
      if (!q || busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setInput("");
      setPending(q);
      setTyping(true);
      try {
        const cur = sessionRef.current;
        const [res] = await Promise.all([
          api<{ conversationId: string; token?: string; total: number; messages: ChatMsg[] }>("/api/chat/messages", {
            body: { conversationId: cur?.id, token: cur?.token, text: q, lang, followup },
          }),
          sleep(550 + Math.random() * 350), // a natural "typing" pause
        ]);
        if (!cur && res.token) {
          const s = { id: res.conversationId, token: res.token };
          adopt(s);
          setStartedAt(new Date());
          rememberRecent(s, q);
        }
        apply(res.messages, res.total);
      } catch (e) {
        if (e instanceof ApiClientError && (e.status === 403 || e.status === 404)) adopt(null);
        setError(e instanceof Error ? e.message : tr("বার্তা পাঠানো যায়নি।", "Could not send the message."));
        setInput(q);
      } finally {
        setPending(null);
        setTyping(false);
        busyRef.current = false;
      }
    },
    [adopt, apply, lang, rememberRecent, tr],
  );

  const newConversation = () => {
    adopt(null);
    countRef.current = 0;
    setMessages([]);
    setEscStatus(null);
    setRating(null);
    setError(null);
    setStartedAt(new Date());
  };

  const openEscalation = async () => {
    const fresh = await refreshConfig(); // working-hours status must be current
    setInHours(fresh?.inHours ?? config?.inHours ?? true);
    setEscOpen(true);
  };

  const confirmEscalation = async () => {
    setEscOpen(false);
    if (escStatus) return; // already handed off
    try {
      let s = sessionRef.current;
      if (!s) {
        // A hand-off needs a conversation to attach to; open one with the request itself.
        const res = await api<{ conversationId: string; token?: string; total: number; messages: ChatMsg[] }>("/api/chat/messages", {
          body: { text: "আমি মানব প্রতিনিধির সাথে কথা বলতে চাই", lang },
        });
        s = { id: res.conversationId, token: res.token! };
        adopt(s);
        setStartedAt(new Date());
        rememberRecent(s, "মানব প্রতিনিধির অনুরোধ");
        apply(res.messages, res.total);
      }
      const r = await api<{ escalationId: string; total: number; messages: ChatMsg[] }>(`/api/chat/${s.id}/escalate`, { body: { token: s.token } });
      apply(r.messages, r.total);
      setEscStatus("new");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("হস্তান্তর করা যায়নি।", "Could not hand off the conversation."));
    }
  };

  const rate = async (n: number) => {
    const s = sessionRef.current;
    if (!s) return;
    setRating(n);
    try {
      await api(`/api/chat/${s.id}/rating`, { body: { token: s.token, rating: n } });
    } catch {
      setRating(null);
    }
  };

  const topicChips = (retry?: boolean) =>
    (config?.topics?.length ?? 0) > 0 ? (
      <>
        <div className="msg" style={{ justifyContent: "center" }}>
          <div className="bubble system">
            {retry ? tr("এই বিষয়গুলোর যেকোনো একটি বেছে নিন", "Please pick one of these topics") : tr("আমি শুধু সরকারি সেবা সংক্রান্ত প্রশ্নের উত্তর দিতে পারি — নিচের যেকোনো বিষয় বেছে নিন", "I can only answer questions about government services — pick a topic below")}
          </div>
        </div>
        <div className="chipsrow">
          {config!.topics.map((topic) => (
            <button key={topic.id} type="button" className="chip" onClick={() => send(topic.sample)}>
              {localizeTopic(topic.label)}
            </button>
          ))}
        </div>
      </>
    ) : null;

  const answeredByBot = visible.some((m) => m.role === "bot" && !m.fallback);
  const openCase = escStatus === "new" || escStatus === "ongoing";
  const sla = config?.slaMinutes ?? 15;

  return (
    <div className="view">
      <div className="chat-wrap">
        <aside className="chat-side">
          <div className="side-block">
            <div className="side-h">{t("chat.topics")}</div>
            <div className="topiclist">
              {(config?.topics ?? []).map((topic) => (
                <button key={topic.id} type="button" className="topicbtn" onClick={() => send(topic.sample)}>
                  <span className="dot" />
                  {localizeTopic(topic.label)}
                </button>
              ))}
            </div>
          </div>
          {recent.length > 0 && (
            <div className="side-block kb-recent">
              <div className="side-h">{t("chat.recent")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recent.map((r) => (
                  <button key={r.id} type="button" className="recent-item recent-btn" onClick={() => loadSession({ id: r.id, token: r.token })}>
                    <div className="rq">{r.title}</div>
                    <div className="rd">{new Date(r.at).toLocaleDateString("bn-BD", { day: "numeric", month: "long" })}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="chat-main">
          {config?.maintenance && (
            <div className="banner-warn" role="status">
              {tr("রক্ষণাবেক্ষণ মোড চালু আছে — বট এখন প্রশ্নের উত্তর দিচ্ছে না।", "Maintenance mode is on — the bot is not answering questions right now.")}
            </div>
          )}
          <div className="chat-scroll" ref={scrollRef}>
            <div className="chat-col" role="log" aria-live="polite" aria-label={tr("কথোপকথন", "Conversation")}>
              <div className="msg" style={{ justifyContent: "center" }}>
                <div className="bubble system">
                  {tr("আজ", "Today")}, <span suppressHydrationWarning>{fmtClock(startedAt)}</span>
                </div>
              </div>
              {greeting && <Bubble role="bot" text={localizeGreeting(greeting)} />}
              {visible.length === 0 && !pending && topicChips()}
              {visible.map((m) => {
                if (m.role === "system") {
                  return (
                    <div key={m.idx} className="msg" style={{ justifyContent: "center" }}>
                      <div className="bubble system">{localizeSystemText(m.text)}</div>
                    </div>
                  );
                }
                if (m.role === "agent") {
                  return (
                    <div key={m.idx} className="msg bot">
                      <div className="avatar agent">{tr("প্র", "A")}</div>
                      <div className="tcol">
                        <div className="agent-name">{tr("মানব প্রতিনিধি", "Human agent")}{m.agent ? ` · ${m.agent}` : ""}</div>
                        <div className="bubble agent">{m.text}</div>
                      </div>
                    </div>
                  );
                }
                const last = m.idx === visible[visible.length - 1]?.idx;
                return (
                  <div key={m.idx} style={{ display: "contents" }}>
                    <Bubble role={m.role} text={m.role === "bot" ? localizeSystemText(m.text) : m.text} />
                    {last && m.role === "bot" && m.fallback && !openCase ? topicChips(true) : null}
                    {last && m.role === "bot" && m.followups?.length ? (
                      <div className="chipsrow">
                        {m.followups.map((f) => (
                          <button
                            key={f.label}
                            type="button"
                            className="chip"
                            onClick={() => m.topic && send(f.label, { topicId: m.topic, label: f.label })}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {pending && <Bubble role="user" text={pending} />}
              {typing && (
                <div className="msg bot" aria-label={tr("উত্তর লেখা হচ্ছে", "Typing a reply")}>
                  <div className="avatar bot">AI</div>
                  <div className="bubble bot typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="chat-foot">
            {error && (
              <div className="chat-foot-col notice err" role="alert">
                {error}
              </div>
            )}
            {answeredByBot && !openCase && (
              <div className="chat-foot-col rate-row">
                {rating ? (
                  <span className="hint">{tr("রেটিং দেওয়ার জন্য ধন্যবাদ", "Thanks for rating")} ({bn(rating)} / {bn(5)})</span>
                ) : (
                  <>
                    <span className="hint">{tr("এই কথোপকথন কি সহায়ক ছিল?", "Was this conversation helpful?")}</span>
                    <div role="group" aria-label={tr("রেটিং", "Rating")} style={{ display: "flex", gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className="star" aria-label={`${bn(n)} ${tr("স্টার", "stars")}`} onClick={() => rate(n)}>
                          ★
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {config?.handoffEnabled && (
              <div className="chat-foot-col escalate-row">
                <button type="button" className="escalate-link" onClick={openEscalation}>
                  {t("chat.escalate")}
                </button>
              </div>
            )}
            <form
              className="chat-foot-col inputrow"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")} autoComplete="off" maxLength={1000} />
              <button type="submit" className="sendbtn" aria-label={tr("পাঠান", "Send")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              </button>
              <button type="button" className="newconvo" onClick={newConversation}>
                {t("chat.new")}
              </button>
            </form>
          </div>
        </div>
      </div>

      <Modal open={escOpen} title={inHours ? tr("মানব প্রতিনিধির সাথে সংযোগ করা হচ্ছে", "Connecting you to a human agent") : tr("আপনার অনুরোধ নথিভুক্ত হয়েছে", "Your request has been recorded")} onClose={() => setEscOpen(false)}>
        <p>
          {inHours
            ? tr(`আপনার কথোপকথন একজন মানব প্রতিনিধির কাছে হস্তান্তর করা হবে। সাধারণত ${bn(sla)} মিনিটের মধ্যে একজন প্রতিনিধি এই কথোপকথনে যুক্ত হবেন। অনুগ্রহ করে অপেক্ষা করুন।`, `Your conversation will be handed to a human agent. An agent will usually join within ${sla} minutes. Please wait.`)
            : (config?.offHoursMessage ?? "")}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setEscOpen(false)}>
            {tr("বাতিল", "Cancel")}
          </button>
          <button type="button" className="btn btn-solid" onClick={confirmEscalation}>
            {tr("বুঝেছি", "Got it")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "bot"; text: string }) {
  const { tr } = useApp();
  return (
    <div className={`msg ${role}`}>
      <div className={`avatar ${role}`}>{role === "bot" ? "AI" : tr("র", "U")}</div>
      <div className={`bubble ${role}`}>{text}</div>
    </div>
  );
}
