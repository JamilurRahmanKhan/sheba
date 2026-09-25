"use client";

import { useState } from "react";
import useSWR from "swr";
import { KbFormModal } from "./KbFormModal";
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

  const tabs: { id: CatFilter; label: string }[] = [{ id: "all", label: "সকল বিভাগ" }, ...FAQ_TOPICS.map((t) => ({ id: t.id, label: t.label }))];
  const q = query.trim();
  const rows = items.filter((i) => (filter === "all" || i.category === filter) && (!q || i.question.includes(q)));

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

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="search" className="input" style={{ width: 250 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="প্রশ্ন খুঁজুন..." aria-label="প্রশ্ন খুঁজুন" />
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
                  <td style={{ maxWidth: 320 }}>{item.question}</td>
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
                    <button type="button" className="btn-link" onClick={() => setModal({ item })}>
                      এডিট করুন
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isLoading && <div className="empty">লোড হচ্ছে…</div>}
        {!isLoading && rows.length === 0 && <div className="empty">কোনো এন্ট্রি পাওয়া যায়নি।</div>}
      </div>

      {modal && <KbFormModal key={modal.item?.id ?? "new"} item={modal.item} onClose={() => setModal(null)} onSave={(input) => save(modal.item?.id ?? null, input)} />}
    </>
  );
}
