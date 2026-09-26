"use client";

import { useState } from "react";
import useSWR from "swr";
import { useApp } from "./AppProvider";
import { KbFormModal } from "./KbFormModal";
import { Modal } from "./Modal";
import { api, errorMessage, fetcher } from "@/lib/api";
import { FAQ_TOPICS, labelFor, type KbInput, type KbItem, type TopicId } from "@/lib/data";

type CatFilter = "all" | TopicId;

export function KbView() {
  const { tr } = useApp();
  const { data, mutate, isLoading } = useSWR<{ items: KbItem[] }>("/api/admin/kb", fetcher, { refreshInterval: 15_000 });
  const items = data?.items ?? [];
  const [filter, setFilter] = useState<CatFilter>("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ item: KbItem | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KbItem | null>(null);
  const [testText, setTestText] = useState("");
  const [testRes, setTestRes] = useState<{ source: "kb" | "topic" | "fallback" | "ai"; answer: string; entry: { id: string; question: string } | null } | null>(null);
  const [testing, setTesting] = useState(false);

  const tabs: { id: CatFilter; label: string }[] = [{ id: "all", label: tr("সকল বিভাগ", "All categories") }, ...FAQ_TOPICS.map((t) => ({ id: t.id, label: labelFor(t.id) }))];
  const q = query.trim();
  const rows = items.filter((i) => (filter === "all" || i.category === filter) && (!q || `${i.question} ${i.answer} ${(i.aliases ?? []).join(" ")}`.includes(q)));

  const toggle = async (item: KbItem) => {
    setError(null);
    try {
      await mutate(async (cur) => {
        await api(`/api/admin/kb/${item.id}`, { method: "PATCH", body: { active: !item.active } });
        return cur && { items: cur.items.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)) };
      }, { revalidate: true, optimisticData: (cur) => ({ items: (cur?.items ?? []).map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)) }), rollbackOnError: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    try {
      setTestRes(await api("/api/admin/kb/test", { body: { text: testText } }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const remove = async (item: KbItem) => {
    setDeleting(null);
    try {
      await api(`/api/admin/kb/${item.id}`, { method: "DELETE" });
      await mutate();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async (id: string | null, input: KbInput) => {
    setError(null);
    try {
      if (id) await api(`/api/admin/kb/${id}`, { method: "PATCH", body: input });
      else await api("/api/admin/kb", { body: input });
      await mutate();
      setModal(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1>{tr("নলেজ বেস ব্যবস্থাপনা", "Knowledge base management")}</h1>
          <p>{tr("বট যেসব প্রশ্ন-উত্তর দিয়ে সাড়া দেয়, তা পরিচালনা করুন। এখানে সক্রিয় এন্ট্রিগুলো থেকেই বট উত্তর দেয়; নিষ্ক্রিয় এন্ট্রি বট ব্যবহার করে না।", "Manage the questions and answers the bot responds with. The bot answers only from active entries; inactive entries are not used.")}</p>
        </div>
        <button type="button" className="btn btn-solid" onClick={() => setModal({ item: null })}>
          {tr("+ নতুন প্রশ্ন যোগ করুন", "+ Add a new question")}
        </button>
      </div>

      {error && (
        <div className="notice err" role="alert">
          {error}
        </div>
      )}

      <section className="card card-pad" aria-label={tr("বট পরীক্ষা", "Bot test")}>
        <h2 className="card-title">{tr("বট পরীক্ষা করুন", "Test the bot")}</h2>
        <form
          className="reply-row"
          style={{ marginTop: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            void runTest();
          }}
        >
          <input type="text" className="input" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder={tr("একটি প্রশ্ন লিখুন — বট এখনই কী উত্তর দিত তা দেখুন (কিছু সংরক্ষিত হয় না)", "Type a question — see what the bot would answer now (nothing is saved)")} aria-label={tr("পরীক্ষার প্রশ্ন", "Test question")} maxLength={1000} />
          <button type="submit" className="btn btn-solid" disabled={testing || !testText.trim()}>
            {testing ? tr("পরীক্ষা হচ্ছে…", "Testing…") : tr("পরীক্ষা করুন", "Test")}
          </button>
        </form>
        {testRes && (
          <div className="preview" style={{ marginTop: 12 }} role="status">
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: testRes.source === "kb" || testRes.source === "ai" ? "var(--success)" : testRes.source === "topic" ? "var(--warn)" : "var(--danger)" }}>
              {testRes.source === "kb" && `${tr("নলেজ বেসের এন্ট্রি থেকে", "From the knowledge-base entry")}: “${testRes.entry?.question}”`}
              {testRes.source === "ai" && tr("AI নলেজ বেসের এন্ট্রি ভিত্তি করে উত্তরটি তৈরি করেছে", "The AI composed this answer from knowledge-base entries")}
              {testRes.source === "topic" && tr("কোনো এন্ট্রি মেলেনি — বিষয়ের সাধারণ উত্তর দিত", "No entry matched — the bot would give the topic's general answer")}
              {testRes.source === "fallback" && tr("মিল পাওয়া যায়নি — বট “বুঝতে পারিনি” বলত। একটি এন্ট্রি বা বিকল্প প্রশ্ন যোগ করুন।", "No match — the bot would say it did not understand. Add an entry or an alternative phrasing.")}
            </div>
            <div style={{ whiteSpace: "pre-line", fontSize: 13.5, lineHeight: 1.7 }}>{testRes.answer}</div>
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="search" className="input" style={{ width: 250 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("প্রশ্ন, উত্তর বা বিকল্প প্রশ্ন খুঁজুন...", "Search questions, answers or alternative phrasings...")} aria-label={tr("খুঁজুন", "Search")} />
        <div className="pillrow">
          {tabs.map((tab) => {
            const n = tab.id === "all" ? items.length : items.filter((i) => i.category === tab.id).length;
            return (
              <button key={tab.id} type="button" className="pill" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>
                {tab.label} ({n})
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("প্রশ্ন", "Question")}</th>
                <th>{tr("বিভাগ", "Category")}</th>
                <th>{tr("ব্যবহৃত হয়েছে", "Times used")}</th>
                <th>{tr("সর্বশেষ হালনাগাদ", "Last updated")}</th>
                <th>{tr("স্ট্যাটাস", "Status")}</th>
                <th>{tr("অ্যাকশন", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td style={{ maxWidth: 320 }}>
                    {item.question}
                    {!!item.aliases?.length && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>+ {item.aliases.length} {tr("টি বিকল্প প্রশ্ন", "alternative phrasings")}</div>}
                  </td>
                  <td style={{ color: "var(--text-2)" }}>{labelFor(item.category)}</td>
                  <td>{item.uses} {tr("বার", "times")}</td>
                  <td style={{ color: "var(--text-2)" }}>{item.updated}</td>
                  <td>
                    <button type="button" className="switch" role="switch" aria-checked={item.active} onClick={() => toggle(item)}>
                      <span className="track">
                        <span className="knob" />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: item.active ? "var(--success)" : "var(--text-3)" }}>{item.active ? tr("সক্রিয়", "Active") : tr("নিষ্ক্রিয়", "Inactive")}</span>
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <button type="button" className="btn-link" onClick={() => setModal({ item })}>
                        {tr("এডিট করুন", "Edit")}
                      </button>
                      <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => setDeleting(item)}>
                        {tr("মুছুন", "Delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <div className="empty">{tr("লোড হচ্ছে…", "Loading…")}</div>}
        {!isLoading && rows.length === 0 && <div className="empty">{tr("কোনো এন্ট্রি পাওয়া যায়নি।", "No entries found.")}</div>}
      </div>

      <Modal open={!!deleting} title={tr("এন্ট্রি মুছবেন?", "Delete this entry?")} onClose={() => setDeleting(null)}>
        <p>“{deleting?.question}” {tr("স্থায়ীভাবে মুছে যাবে এবং বট আর এটি ব্যবহার করবে না। শুধু সাময়িক বন্ধ রাখতে চাইলে বাতিল করে “নিষ্ক্রিয়” করুন।", "will be permanently deleted and the bot will no longer use it. To pause it temporarily, cancel and mark it inactive instead.")}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)} data-autofocus>
            {tr("বাতিল", "Cancel")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => deleting && remove(deleting)}>
            {tr("হ্যাঁ, মুছুন", "Yes, delete")}
          </button>
        </div>
      </Modal>

      {modal && <KbFormModal key={modal.item?.id ?? "new"} item={modal.item} onClose={() => setModal(null)} onSave={(input) => save(modal.item?.id ?? null, input)} />}
    </>
  );
}
