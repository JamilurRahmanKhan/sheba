"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { api, errorMessage, fetcher, qs } from "@/lib/api";
import { bn, fmtDateTime } from "@/lib/conversations";
import { localizeTopic, STATUS_META, type EscStatus, type Escalation } from "@/lib/data";
import { useApp } from "./AppProvider";

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
  const { tr } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const { data: stats } = useSWR<Dashboard>("/api/admin/dashboard", fetcher, { refreshInterval: 15_000 });
  const listKey = `/api/admin/escalations${qs({ status: filter === "all" ? undefined : filter, pageSize: 20 })}`;
  const { data: list, mutate } = useSWR<{ items: Escalation[] }>(listKey, fetcher, { refreshInterval: 8_000, keepPreviousData: true });

  const e = stats?.escalations;
  const cards: { key: Exclude<Filter, "all">; label: string; color: string; value?: number }[] = [
    { key: "new", label: tr("নতুন হস্তান্তর", "New hand-offs"), color: "var(--info)", value: e?.new },
    { key: "ongoing", label: tr("চলমান", "In progress"), color: "var(--warn)", value: e?.ongoing },
    { key: "resolved", label: tr("সমাধান হয়েছে", "Resolved"), color: "var(--success)", value: e?.resolved },
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
        <h1>{tr("চ্যাটবট ড্যাশবোর্ড", "Chatbot dashboard")}</h1>
        <p>{tr("আজকের কার্যক্রম ও কর্মক্ষমতার সার-সংক্ষেপ। হস্তান্তরের কার্ডে ক্লিক করে নিচের তালিকা ফিল্টার করুন; আবার ক্লিক করলে ফিল্টার সরে যাবে।", "A summary of today's activity and performance. Click a hand-off card to filter the list below; click again to clear the filter.")}</p>
      </div>

      {error && (
        <div className="notice err" role="alert">
          {error}
        </div>
      )}

      <div className="stat-grid">
        <div className="statcard" style={{ cursor: "default" }}>
          <div className="label">{tr("আজকের কথোপকথন", "Conversations today")}</div>
          <div className="num" style={{ color: "var(--accent)" }}>
            {stats ? bn(stats.conversationsToday) : "—"}
          </div>
        </div>
        {cards.map((s) => (
          <button key={s.key} type="button" className="statcard" aria-pressed={filter === s.key} onClick={() => setFilter(filter === s.key ? "all" : s.key)} title={filter === s.key ? tr("ফিল্টার সরান", "Clear filter") : tr("তালিকা ফিল্টার করুন", "Filter the list")}>
            <div className="label">{s.label}</div>
            <div className="num" style={{ color: s.color }}>
              {s.value === undefined ? "—" : bn(s.value)}
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div className="card card-pad" style={{ flex: 1.3, minWidth: 280 }}>
          <div className="card-title">{tr("শীর্ষ জিজ্ঞাসিত বিষয় (গত ৩০ দিন)", "Top topics (last 30 days)")}</div>
          {stats && stats.topics.length === 0 && <p className="hint">{tr("এখনও পর্যাপ্ত কথোপকথন নেই।", "Not enough conversations yet.")}</p>}
          {(stats?.topics ?? []).map((s) => (
            <div key={s.label} className="bar-row">
              <div className="bl">{localizeTopic(s.label)}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${s.width}%` }} />
              </div>
              <div className="bar-pct">{bn(s.share)}%</div>
            </div>
          ))}
        </div>
        <div className="card card-pad tile-row" style={{ flex: 1, minWidth: 220 }}>
          <div className="tile">
            <div className="tl">{tr("বট উত্তর দেওয়ার হার (গত ৭ দিন)", "Bot answer rate (last 7 days)")}</div>
            <div className="tv">{stats?.aiResolveRate == null ? "—" : `${bn(stats.aiResolveRate)}%`}</div>
            {stats && stats.aiResolveRate == null && (
              <div className="td" style={{ color: "var(--text-2)" }}>
                {tr(`নমুনা কম (${bn(stats.aiResolveSample)}টি কথোপকথন) — কমপক্ষে ১০টি হলে দেখানো হবে`, `Small sample (${stats.aiResolveSample} conversations) — shown once there are at least 10`)}
              </div>
            )}
            {stats?.aiResolveDelta != null && (
              <div className="td" style={stats.aiResolveDelta < 0 ? { color: "var(--danger)" } : undefined}>
                {tr("আগের সপ্তাহের তুলনায়", "vs. previous week")} {stats.aiResolveDelta >= 0 ? "+" : "−"}
                {bn(Math.abs(stats.aiResolveDelta))}%
              </div>
            )}
          </div>
          <div style={{ height: 1, background: "var(--border)" }} />
          <div className="tile">
            <div className="tl">{tr("গড় সন্তুষ্টি রেটিং", "Average satisfaction rating")}</div>
            <div className="tv">
              {stats?.avgRating == null ? "—" : bn(stats.avgRating, 1)} <span style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 500 }}>/ {bn(5)}</span>
            </div>
            <div className="td" style={{ color: "var(--text-2)" }}>
              {stats ? tr(`${bn(stats.ratingCount)}টি রেটিং-এর ভিত্তিতে`, `Based on ${stats.ratingCount} ratings`) : ""}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">{tr("হস্তান্তরকৃত প্রশ্ন", "Handed-off questions")}</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr("প্রশ্ন", "Question")}</th>
                <th>{tr("নাগরিক", "Citizen")}</th>
                <th>{tr("সময়", "Time")}</th>
                <th>{tr("বিভাগ", "Department")}</th>
                <th>{tr("স্ট্যাটাস", "Status")}</th>
                <th>{tr("অ্যাকশন", "Action")}</th>
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
                          {tr("গ্রহণ করুন", "Accept")}
                        </button>
                      ) : (
                        <Link href={`/admin/escalations?open=${row.id}`} className="btn-link">
                          {row.status === "ongoing" ? tr("খুলুন →", "Open →") : tr("দেখুন →", "View →")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list && list.items.length === 0 && <div className="empty">{tr("এই ফিল্টারে কোনো হস্তান্তর নেই।", "No hand-offs match this filter.")}</div>}
      </div>
    </>
  );
}
