"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { FAQ_TOPICS, type KbInput, type KbItem, type TopicId } from "@/lib/data";

export function KbFormModal({
  item,
  defaults,
  onClose,
  onSave,
}: {
  item: KbItem | null;
  /** prefill for a new entry (e.g. from an unanswered conversation) */
  defaults?: Partial<KbInput>;
  onClose: () => void;
  onSave: (v: KbInput) => void;
}) {
  const [question, setQuestion] = useState(item?.question ?? defaults?.question ?? "");
  // Prefilled entries without a known topic (e.g. unanswered chats) must be categorised by the admin.
  const mustChoose = !item && !!defaults && !defaults.category;
  const [category, setCategory] = useState<TopicId | "">(
    item?.category ?? defaults?.category ?? (mustChoose ? "" : FAQ_TOPICS[0].id),
  );
  const [answer, setAnswer] = useState(item?.answer ?? defaults?.answer ?? "");

  return (
    <Modal open title={item ? "প্রশ্ন সম্পাদনা করুন" : "নতুন প্রশ্ন যোগ করুন"} onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          const a = answer.trim();
          if (q && a && category) onSave({ question: q, category, answer: a });
        }}
      >
        <label className="field">
          প্রশ্ন
          <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} required />
        </label>
        <label className="field">
          বিভাগ
          <select value={category} onChange={(e) => setCategory(e.target.value as TopicId)} required>
            {mustChoose && (
              <option value="" disabled>
                বিভাগ নির্বাচন করুন
              </option>
            )}
            {FAQ_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          উত্তর
          <textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} required />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            বাতিল
          </button>
          <button type="submit" className="btn btn-solid">
            সংরক্ষণ করুন
          </button>
        </div>
      </form>
    </Modal>
  );
}
