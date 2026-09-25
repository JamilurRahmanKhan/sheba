"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="login-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/auth/login", { body: { email, password } });
          // Full navigation so the server layout re-reads the new session cookie.
          // Full navigation on purpose so the server layout re-reads the new session cookie.
          window.location.assign(next);
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <div>
        <h1>স্টাফ লগইন</h1>
        <p>অ্যাডমিন প্যানেলে প্রবেশ করতে আপনার অফিসিয়াল ইমেইল ও পাসওয়ার্ড দিন। নাগরিকদের চ্যাট ব্যবহারে লগইন লাগে না।</p>
      </div>
      <label className="field">
        ইমেইল
        <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
      </label>
      <label className="field">
        পাসওয়ার্ড
        <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && (
        <div className="notice err" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="btn btn-solid" style={{ padding: "12px 16px", fontSize: 13.5 }} disabled={busy}>
        {busy ? "যাচাই করা হচ্ছে…" : "লগইন করুন"}
      </button>
    </form>
  );
}
