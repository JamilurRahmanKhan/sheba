"use client";

import { useEffect, useRef } from "react";
import { fmtTime, type LogMessage } from "@/lib/conversations";

export function Transcript({ messages, maxHeight }: { messages: LogMessage[]; maxHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return (
    <div ref={ref} className="transcript" tabIndex={0} aria-label="কথোপকথনের প্রতিলিপি" style={maxHeight ? { maxHeight } : undefined}>
      {messages.map((m, i) =>
        m.role === "system" ? (
          <div key={i} className="msg" style={{ justifyContent: "center" }}>
            <div className="bubble system">
              {m.text} <span className="tmsg-time" style={{ display: "inline" }}>· {fmtTime(m.at)}</span>
            </div>
          </div>
        ) : (
          <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
            <div className={`avatar ${m.role}`}>{m.role === "bot" ? "AI" : m.role === "agent" ? "প্র" : "র"}</div>
            <div className="tcol">
              {m.role === "agent" && <div className="agent-name">মানব প্রতিনিধি{m.agent ? ` · ${m.agent}` : ""}</div>}
              <div className={`bubble ${m.role}`}>{m.text}</div>
              <div className="tmsg-time" style={m.fallback ? { color: "var(--danger)" } : undefined}>
                {fmtTime(m.at)}
                {m.fallback ? " · বট উত্তর দিতে পারেনি" : ""}{m.ai ? " · AI দিয়ে তৈরি" : ""}
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
