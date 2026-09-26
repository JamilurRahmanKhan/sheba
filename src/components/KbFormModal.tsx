"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { Modal } from "./Modal";
import { FAQ_TOPICS, labelFor, type KbInput, type KbItem, type TopicId } from "@/lib/data";

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
  const { tr } = useApp();
  const [question, setQuestion] = useState(item?.question ?? defaults?.question ?? "");
  // Prefilled entries without a known topic (e.g. unanswered chats) must be categorised by the admin.
  const mustChoose = !item && !!defaults && !defaults.category;
  const [category, setCategory] = useState<TopicId | "">(
    item?.category ?? defaults?.category ?? (mustChoose ? "" : FAQ_TOPICS[0].id),
  );
  const [answer, setAnswer] = useState(item?.answer ?? defaults?.answer ?? "");
  const [aliases, setAliases] = useState((item?.aliases ?? defaults?.aliases ?? []).join("\n"));

  return (
    <Modal open title={item ? tr("প্রশ্ন সম্পাদনা করুন", "Edit question") : tr("নতুন প্রশ্ন যোগ করুন", "Add a new question")} onClose={onClose}>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.trim();
          const a = answer.trim();
          if (q && a && category) onSave({ question: q, category, answer: a, aliases: aliases.split("\n").map((x) => x.trim()).filter(Boolean) });
        }}
      >
        <label className="field">
          {tr("প্রশ্ন", "Question")}
          <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} required />
        </label>
        <label className="field">
          {tr("বিভাগ", "Category")}
          <select value={category} onChange={(e) => setCategory(e.target.value as TopicId)} required>
            {mustChoose && (
              <option value="" disabled>
                {tr("বিভাগ নির্বাচন করুন", "Select a category")}
              </option>
            )}
            {FAQ_TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {labelFor(t.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {tr("উত্তর", "Answer")}
          <textarea rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} required />
        </label>
        <label className="field">
          {tr("বিকল্প প্রশ্ন (ঐচ্ছিক — প্রতি লাইনে একটি)", "Alternative phrasings (optional — one per line)")}
          <textarea rows={3} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder={tr("নাগরিকরা একই কথা অন্যভাবে যেভাবে জিজ্ঞেস করেন, যেমন:\nবিদ্যুৎ বিল কোথায় দেব\nবিল পেমেন্টের উপায়", "Other ways citizens ask the same thing, e.g.:\nwhere to pay electricity bill\nhow to pay a bill")} />
          <span className="field-hint">{tr("বট এই বাক্যগুলোও মিলিয়ে দেখে — এতে ভিন্নভাবে করা প্রশ্নেও সঠিক উত্তর মেলে।", "The bot matches these phrasings too, so differently worded questions still find the right answer.")}</span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {tr("বাতিল", "Cancel")}
          </button>
          <button type="submit" className="btn btn-solid">
            {tr("সংরক্ষণ করুন", "Save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
