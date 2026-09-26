"use client";

import { useState } from "react";
import useSWR from "swr";
import { KbFormModal } from "./KbFormModal";
import { Modal } from "./Modal";
import { api, errorMessage, fetcher } from "@/lib/api";
import { FAQ_TOPICS, labelFor, type KbInput, type KbItem, type TopicId } from "@/lib/data";

type CatFilter = "all" | TopicId;

export function KbView() {
  const { data, mutate, isLoading } = useSWR<{ items: KbItem[] }>("/api/admin/kb", fetcher, { refreshInterval: 15_000 });
  const items = data?.items ?? [];
  const [filter, setFilter] = useState<CatFilter>("all");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ item: KbItem | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KbItem | null>(null);
  const [testText, setTestText] = useState("");
  const [testRes, setTestRes] = useState<{ source: "kb" | "topic" | "fallback"; answer: string; entry: { id: string; question: string } | null } | null>(null);
  const [testing, setTesting] = useState(false);

  const tabs: { id: CatFilter; label: string }[] = [{ id: "all", label: "সকল বিভাগ" }, ...FAQ_TOPICS.map((t) => ({ id: t.id, label: t.label }))];
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
          <h1>নলেজ বেস ব্যবস্থাপনা</h1>
          <p>বট যেসব প্রশ্ন-উত্তর দিয়ে সাড়া দেয়, তা পরিচালনা করুন। এখানে সক্রিয় এন্ট্রিগুলো থেকেই বট উত্তর দেয়; নিষ্ক্রিয় এন্ট্রি বট ব্যবহার করে না।</p>
        </div>
        <button type="button" className="btn btn-solid" onClick={() => setModal({ item: null })}>
          + নতুন প্রশ্ন যোগ করুন
        </button>
      </div>

      {error && (
        <div className="notice err" role="alert">
          {error}
        </div>
      )}

      <section className="card card-pad" aria-label="বট পরীক্ষা">
        <h2 className="card-title">বট পরীক্ষা করুন</h2>
        <form
          className="reply-row"
          style={{ marginTop: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            void runTest();
          }}
        >
          <input type="text" className="input" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="একটি প্রশ্ন লিখুন — বট এখনই কী উত্তর দিত তা দেখুন (কিছু সংরক্ষিত হয় না)" aria-label="পরীক্ষার প্রশ্ন" maxLength={1000} />
          <button type="submit" className="btn btn-solid" disabled={testing || !testText.trim()}>
            {testing ? "পরীক্ষা হচ্ছে…" : "পরীক্ষা করুন"}
          </button>
        </form>
        {testRes && (
          <div className="preview" style={{ marginTop: 12 }} role="status">
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: testRes.source === "kb" ? "var(--success)" : testRes.source === "topic" ? "var(--warn)" : "var(--danger)" }}>
              {testRes.source === "kb" && `নলেজ বেসের এন্ট্রি থেকে: “${testRes.entry?.question}”`}
              {testRes.source === "topic" && "কোনো এন্ট্রি মেলেনি — বিষয়ের সাধারণ উত্তর দিত"}
              {testRes.source === "fallback" && "মিল পাওয়া যায়নি — বট “বুঝতে পারিনি” বলত। একটি এন্ট্রি বা বিকল্প প্রশ্ন যোগ করুন।"}
            </div>
            <div style={{ whiteSpace: "pre-line", fontSize: 13.5, lineHeight: 1.7 }}>{testRes.answer}</div>
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="search" className="input" style={{ width: 250 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="প্রশ্ন, উত্তর বা বিকল্প প্রশ্ন খুঁজুন..." aria-label="খুঁজুন" />
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
                <th>প্রশ্ন</th>
                <th>বিভাগ</th>
                <th>ব্যবহৃত হয়েছে</th>
                <th>সর্বশেষ হালনাগাদ</th>
                <th>স্ট্যাটাস</th>
                <th>অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td style={{ maxWidth: 320 }}>
                    {item.question}
                    {!!item.aliases?.length && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>+ {item.aliases.length}টি বিকল্প প্রশ্ন</div>}
                  </td>
                  <td style={{ color: "var(--text-2)" }}>{labelFor(item.category)}</td>
                  <td>{item.uses} বার</td>
                  <td style={{ color: "var(--text-2)" }}>{item.updated}</td>
                  <td>
                    <button type="button" className="switch" role="switch" aria-checked={item.active} onClick={() => toggle(item)}>
                      <span className="track">
                        <span className="knob" />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: item.active ? "var(--success)" : "var(--text-3)" }}>{item.active ? "সক্রিয়" : "নিষ্ক্রিয়"}</span>
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                      <button type="button" className="btn-link" onClick={() => setModal({ item })}>
                        এডিট করুন
                      </button>
                      <button type="button" className="btn-link" style={{ color: "var(--danger)" }} onClick={() => setDeleting(item)}>
                        মুছুন
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <div className="empty">লোড হচ্ছে…</div>}
        {!isLoading && rows.length === 0 && <div className="empty">কোনো এন্ট্রি পাওয়া যায়নি।</div>}
      </div>

      <Modal open={!!deleting} title="এন্ট্রি মুছবেন?" onClose={() => setDeleting(null)}>
        <p>“{deleting?.question}” স্থায়ীভাবে মুছে যাবে এবং বট আর এটি ব্যবহার করবে না। শুধু সাময়িক বন্ধ রাখতে চাইলে বাতিল করে “নিষ্ক্রিয়” করুন।</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={() => setDeleting(null)} data-autofocus>
            বাতিল
          </button>
          <button type="button" className="btn btn-danger" onClick={() => deleting && remove(deleting)}>
            হ্যাঁ, মুছুন
          </button>
        </div>
      </Modal>

      {modal && <KbFormModal key={modal.item?.id ?? "new"} item={modal.item} onClose={() => setModal(null)} onSave={(input) => save(modal.item?.id ?? null, input)} />}
    </>
  );
}
