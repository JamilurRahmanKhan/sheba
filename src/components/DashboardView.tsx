"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, errorMessage, fetcher, qs } from "@/lib/api";
import { bn, fmtDateTime } from "@/lib/conversations";
import { STATUS_META, type EscStatus, type Escalation } from "@/lib/data";

type Filter = "all" | EscStatus;

interface Dashboard {
  conversationsToday: number;
  escalations: Record<EscStatus, number>;
  topics: { label: string; share: number; width: number }[];
  aiResolveRate: number | null;
  aiResolveSample: number;
  aiResolveDelta: number | null;
  avgRating: number | null;
  ratingCount: number;
}

export function DashboardView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const { data: stats } = useSWR<Dashboard>("/api/admin/dashboard", fetcher, { refreshInterval: 15_000 });
  const listKey = `/api/admin/escalations${qs({ status: filter === "all" ? undefined : filter, pageSize: 20 })}`;
  const { data: list, mutate } = useSWR<{ items: Escalation[] }>(listKey, fetcher, { refreshInterval: 8_000, keepPreviousData: true });

  const e = stats?.escalations;
  const cards: { key: Exclude<Filter, "all">; label: string; color: string; value?: number }[] = [
    { key: "new", label: "নতুন হস্তান্তর", color: "var(--info)", value: e?.new },
    { key: "ongoing", label: "চলমান", color: "var(--warn)", value: e?.ongoing },
    { key: "resolved", label: "সমাধান হয়েছে", color: "var(--success)", value: e?.resolved },
  ];

  const accept = async (id: string) => {
    setError(null);
    try {
      await api(`/api/admin/escalations/${id}`, { body: { action: "accept" } });
      await mutate();
    } catch (err) {
      setError(errorMessage(err));
      await mutate();
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>চ্যাটবট ড্যাশবোর্ড</h1>
        <p>আজকের কার্যক্রম ও কর্মক্ষমতার সার-সংক্ষেপ। হস্তান্তরের কার্ডে ক্লিক করে নিচের তালিকা ফিল্টার করুন; আবার ক্লিক করলে ফিল্টার সরে যাবে।</p>
      </div>

      {error && (
        <div className="notice err" role="alert">
          {error}
        </div>
      )}

      <div className="stat-grid">
        <div className="statcard" style={{ cursor: "default" }}>
          <div className="label">আজকের কথোপকথন</div>
          <div className="num" style={{ color: "var(--accent)" }}>
            {stats ? bn(stats.conversationsToday) : "—"}
          </div>
        </div>
        {cards.map((s) => (
          <button key={s.key} type="button" className="statcard" aria-pressed={filter === s.key} onClick={() => setFilter(filter === s.key ? "all" : s.key)} title={filter === s.key ? "ফিল্টার সরান" : "তালিকা ফিল্টার করুন"}>
            <div className="label">{s.label}</div>
            <div className="num" style={{ color: s.color }}>
              {s.value === undefined ? "—" : bn(s.value)}
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div className="card card-pad" style={{ flex: 1.3, minWidth: 280 }}>
          <div className="card-title">শীর্ষ জিজ্ঞাসিত বিষয় (গত ৩০ দিন)</div>
          {stats && stats.topics.length === 0 && <p className="hint">এখনও পর্যাপ্ত কথোপকথন নেই।</p>}
          {(stats?.topics ?? []).map((s) => (
            <div key={s.label} className="bar-row">
              <div className="bl">{s.label}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${s.width}%` }} />
              </div>
              <div className="bar-pct">{bn(s.share)}%</div>
            </div>
          ))}
        </div>
        <div className="card card-pad tile-row" style={{ flex: 1, minWidth: 220 }}>
          <div className="tile">
            <div className="tl">বট উত্তর দেওয়ার হার (গত ৭ দিন)</div>
            <div className="tv">{stats?.aiResolveRate == null ? "—" : `${bn(stats.aiResolveRate)}%`}</div>
            {stats && stats.aiResolveRate == null && (
              <div className="td" style={{ color: "var(--text-2)" }}>
                নমুনা কম ({bn(stats.aiResolveSample)}টি কথোপকথন) — কমপক্ষে ১০টি হলে দেখানো হবে
              </div>
            )}
            {stats?.aiResolveDelta != null && (
              <div className="td" style={stats.aiResolveDelta < 0 ? { color: "var(--danger)" } : undefined}>
                আগের সপ্তাহের তুলনায় {stats.aiResolveDelta >= 0 ? "+" : "−"}
                {bn(Math.abs(stats.aiResolveDelta))}%
              </div>
            )}
          </div>
          <div style={{ height: 1, background: "var(--border)" }} />
          <div className="tile">
            <div className="tl">গড় সন্তুষ্টি রেটিং</div>
            <div className="tv">
              {stats?.avgRating == null ? "—" : bn(stats.avgRating, 1)} <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>/ ৫</span>
            </div>
            <div className="td" style={{ color: "var(--text-2)" }}>
              {stats ? `${bn(stats.ratingCount)}টি রেটিং-এর ভিত্তিতে` : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">হস্তান্তরকৃত প্রশ্ন</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>প্রশ্ন</th>
                <th>নাগরিক</th>
                <th>সময়</th>
                <th>বিভাগ</th>
                <th>স্ট্যাটাস</th>
                <th>অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {(list?.items ?? []).map((row) => {
                const meta = STATUS_META[row.status];
                return (
                  <tr key={row.id}>
                    <td style={{ maxWidth: 260 }}>{row.question}</td>
                    <td>{row.citizen}</td>
                    <td style={{ color: "var(--text-2)", whiteSpace: "nowrap" }}>{fmtDateTime(row.createdAt)}</td>
                    <td style={{ color: "var(--text-2)" }}>{row.dept}</td>
                    <td>
                      <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      {row.status === "new" ? (
                        <button type="button" className="btn btn-solid" onClick={() => accept(row.id)}>
                          গ্রহণ করুন
                        </button>
                      ) : (
                        <Link href={`/admin/escalations?open=${row.id}`} className="btn-link">
                          {row.status === "ongoing" ? "খুলুন →" : "দেখুন →"}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list && list.items.length === 0 && <div className="empty">এই ফিল্টারে কোনো হস্তান্তর নেই।</div>}
      </div>
    </>
  );
}
