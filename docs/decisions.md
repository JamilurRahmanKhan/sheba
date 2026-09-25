# Decisions

## Phase 1 — Port of `সেবা সহায়ক AI.html` to Next.js (2026-09-24)

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4 (installed for new pages; ported UI keeps the prototype's own CSS + tokens in `src/app/globals.css`, mapped to Tailwind via `@theme inline`).
- **Routes** (the prototype's tab switching became real routes):
  `/` → `/chat`, `/admin` (dashboard), `/admin/kb`, and placeholders for pages the prototype did not have:
  `/admin/conversations`, `/admin/escalations`, `/admin/settings`. The prototype's "কথোপকথন লগ" link pointed at the chat view as a stand-in; it now points to its own (placeholder) page.
- **State:** `src/components/AppProvider.tsx` holds lang, theme, KB items, escalations; persisted to `localStorage["sebaSohayokState"]`. This is the seam to replace with an API/DB in the functional phase.
- **Data:** all seed content in `src/lib/data.ts`. Answers use `\n` instead of `<br>` (rendered with `white-space: pre-line`) so admin-entered text never needs `dangerouslySetInnerHTML`.
- **i18n:** only the strings the prototype translated (tabs, chat sidebar, input, escalate link) are in `src/lib/i18n.ts`. Full bilingual coverage is a later task.
- **Deliberate deviations from the prototype (bugs/UX fixes):**
  - KB edits to seeded items now persist (prototype only persisted new items + disabled flags).
  - App shell is fixed to viewport height; panes scroll internally (chat footer stays pinned).
  - Admin sidebar is kept as a horizontal strip on mobile (prototype hid it, stranding sub-pages).
  - Mobile top bar: controls on row 1, full-width 44px tabs on row 2.
  - Modals: Esc to close, focus restore, scrollable on small screens; tables scroll horizontally instead of crushing columns.
  - Pending bot replies are cancelled on "+ নতুন" (prototype could deliver a stale reply into the new chat).

## Known gaps (for later phases, parity with the prototype)
- Chat answers come only from the hard-coded `FAQ_TOPICS`; KB toggles/edits/new entries do not affect the bot yet.
- Dashboard numbers, escalations, "recent conversations" are static seed data.
- No auth on `/admin`.

## Phase 2 — কথোপকথন লগ (`/admin/conversations`) (2026-09-24)

**Analysis — what the page needs:** nothing recorded chats before, so the log required (1) a persisted conversation model and (2) real escalation records from the chat, then the page itself.

- **Model** (`src/lib/conversations.ts`): `Conversation` = id, startedAt, lang, topic, messages[{role, text, at, fallback?, topic?}], escalated/escalationId, rating?, reviewed, flagged, note, kbAdded. **Outcome is derived**, not stored: escalated → `হস্তান্তর`; any bot fallback → `উত্তর পাওয়া যায়নি`; else `AI সমাধান`.
- **Chat now records** every conversation via `upsertConversation` (ids `CV-1001…` sequential). "মানব প্রতিনিধি" now creates a real `new` escalation (`VB-2026-xxxx`, citizen "বেনামী নাগরিক", dept from topic) and links it; a second click in the same chat does not duplicate it.
- **Seed history:** 30 conversations built by running the real `matchTopic` logic, timestamps anchored to first client load then persisted (so the log never looks stale on first open). Cleared localStorage = re-seed.
- **Page:** outcome cards (filter + % share), search (id / whole transcript / note), topic, period, review-state, sort; 10/page; CSV export of the filtered set (UTF-8 BOM for Excel); detail modal with full transcript, metadata, review toggle, flag, internal note, and **"নলেজ বেসে যোগ করুন"** on unanswered chats (prefilled question, admin must pick the category; marks the chat reviewed + `kbAdded`).
- Times are shown in Asia/Dhaka, 24h, Bengali digits.

**Not done (deliberately, next phases):**
- Citizen rating is display-only — the chat UI has no rating prompt yet, so live chats show "—".
- KB entries added from the log do **not** change bot answers yet (bot still uses `FAQ_TOPICS`).
- No retention / delete / PII-masking policy (belongs in Settings); no server persistence or admin auth.
- Dashboard cards and the chat sidebar "recent conversations" are still static and should later derive from this data.

## Phase 3 — হস্তান্তরকৃত প্রশ্ন (`/admin/escalations`) (2026-09-24)

**Analysis:** an escalation was only `{id, question, citizen, time-string, dept, status}` with one button per state — a list, not a work queue. A real hand-off desk needs: real timestamps + SLA, ownership + priority, a way to actually answer the citizen, a case history, a required resolution, and a path back into the KB.

- **Model** (`Escalation` in `src/lib/data.ts`): + `createdAt/acceptedAt/resolvedAt` (ISO), `priority`, `assignee`, `resolution`, `activity[]` (events + internal notes), `kbAdded`. Old saved data and the prototype seed rows are upgraded by `normalizeEscalation` (`src/lib/escalations.ts`), anchoring timestamps to the linked conversation.
- **Workflow** (provider): accept → (reply / notes / reassign / priority) → resolve (summary **required**) → reopen. Accept/resolve/reopen also post a notice into the citizen's chat.
- **Agent replies reach the citizen:** `LogMessage.role = "agent"` (+ `admin` system notices). `upsertConversation` preserves them when the chat re-saves; `ChatView` renders them live. Open tabs sync via the `storage` event (only replaces data that differs, so no write ping-pong).
- **Bot goes quiet after handoff:** once escalated, further citizen messages get no auto-reply (a human owns the chat).
- **Page:** status cards with SLA/response stats (SLA = 15 min, matching the chat's promise), filters (search, dept, priority, assignee), work-queue sort (open first, urgent first, longest waiting first), pagination, CSV; detail modal with transcript, reply box, timeline, resolution, reopen, and **"resolved → KB"** (question + resolution prefilled; admin must choose the category).
- `/admin/conversations?q=` now prefills search (the case links to its chat).
- Dashboard buttons still work; `setEscStatus` maps to accept/resolve.

**Not done (next phases):**
- Officers are a fixed placeholder list; `CURRENT_AGENT` is hard-coded until auth exists.
- Sync is localStorage-only (same browser); real multi-user needs a backend (last-writer-wins in tight races).
- No citizen contact details / notifications; citizen is anonymous ("বেনামী নাগরিক") for chat handoffs.
- Escalation SLA is a constant; should be configurable in Settings.

## Phase 4 — সেটিংস (`/admin/settings`) (2026-09-24)

**Analysis:** the hard-coded values that an administrator would need to control were: officers + "who am I" (`AGENTS`/`CURRENT_AGENT`), the 15-min SLA (also stated in the chat modal as "10–15 min"), greeting/fallback texts, sidebar title/department, and (missing entirely) working hours, maintenance mode, retention and backup. Rule: **no dead toggles** — every setting below is consumed by the chat, queue or sidebar.

- **Model:** `Settings` in `src/lib/settings.ts` (defaults, `validateSettings`, `mergeSettings` for old/imported data, `withinWorkingHours` in Asia/Dhaka), persisted in the same `localStorage` blob and synced across tabs.
- **Sections:** সাধারণ (org names; language/theme apply instantly), হস্তান্তর ও সময়সূচি (handoff on/off, SLA minutes, working days/hours, off-hours message), বট (greeting, fallback, maintenance mode + message), টিম (add / role / activate / "আমি"), ডেটা ও গোপনীয়তা (retention, backup JSON, restore, reset).
- **Where they take effect:** chat (greeting, fallback, maintenance banner + reply logged as "unanswered", hidden handoff link, off-hours modal + system message, SLA minutes in the promise text); queue (SLA overdue, assignee options, "mine" filter, accept/notes attributed to the current officer); sidebar (title/department).
- **Save model:** text/number settings use a draft + sticky save bar with validation (errors mark the tab and jump to it); team ops and instant preferences apply immediately. Restore/reset re-initialise the form (a stale draft could otherwise overwrite restored data).
- **Team rules:** names are immutable and members cannot be deleted (assignee/activity history stores the name); cannot deactivate yourself or the last active member; inactive members stay visible on old cases.
- **Retention:** applied at app load and via "এখনই পরিষ্কার করুন" (with preview count from the same `retainConversations` rule); chats attached to an open case are never deleted; escalation records are kept.
- **Backup/restore:** versioned JSON envelope `{app, version, exportedAt, data}`; import validates shape before replacing anything.

**Not done (deliberately):**
- No authentication/roles: "আমি" is a manual selector; anyone with the URL can change settings (needs login before real use).
- Working hours affect only citizen messaging — SLA timing does not pause outside hours.
- No email/SMS/desktop notifications for new hand-offs (needs a backend or Notification API work).
- Topics/categories are still fixed in code (`FAQ_TOPICS`); managing them belongs with the KB rework.
- Backup contains citizen chats; no PII masking / encryption. Data still lives only in this browser's localStorage.

## Phase 5 — Backend, database, auth (Vercel + MongoDB) (2026-09-25)

**Decision:** MongoDB (official `mongodb` driver, no ODM) on Atlas, hosted on Vercel. Everything that used `localStorage` now lives in the database behind `/api`; the browser keeps only language/theme and the citizen's own chat session.

- **Collections:** `users`, `conversations` (transcript embedded + denormalised `outcome/firstQuestion/searchText/…` so lists filter/sort/paginate in the DB), `escalations`, `kb`, `settings` (single doc), `counters` (atomic sequential ids `CV-…`, `VB-YYYY-…`). String `_id`s keep the readable ids.
- **Connection:** cached client on `globalThis` + `attachDatabasePool` on Vercel; indexes ensured lazily once per instance.
- **Auth:** own implementation (jose JWT in an httpOnly cookie + bcryptjs). Team members are now real accounts (email/password/role); "I am…" is the logged-in user. Lockout after 5 failed logins (15 min), generic error + dummy hash for unknown emails, JSON-only bodies (CSRF), same-origin `next` redirects only. First admin bootstrapped from env.
- **Bot reads the KB** (`src/server/bot.ts`): closes the earlier gap where KB edits/toggles did nothing. Verified: new entry → answered; edit → reflected; deactivate → not used; `uses` counters real.
- **Correctness under concurrency:** escalation claim and case accept/resolve use conditional atomic updates (verified: parallel accepts → one 200, one 409; double escalate → one case; ids from atomic counters).
- **Realtime:** polling (chat 4 s; admin lists 8–10 s; open case 4 s). Deliberately not SSE/WebSockets: serverless functions have execution limits; polling is reliable on Vercel.
- **New/real features enabled by the backend:** citizen rating prompt (dashboard averages are real), dashboard stats from aggregations (today count, topic mix, AI-resolution rate and week-over-week delta), server-side CSV exports, admin backup/restore/reset/purge, daily retention cron, security headers, per-instance rate limiting (chat/login).
- **Roles:** admin = all; officer = conversations, hand-offs, KB (+ own password/interface). Settings/team/data are admin-only (403 verified).
- **Removed:** all `localStorage` business data, seed-on-client logic, the fake "recent conversations" list (now the citizen's own recent chats), `ComingSoon`.

**Known gaps / next:**
- Rate limiting is per serverless instance (a speed bump). For real abuse protection add Vercel WAF/Firewall rules or a shared store (e.g. Upstash).
- No automated test suite yet (verification was manual + scripted API checks). Add integration tests (Vitest + mongodb-memory-server) for bot matching, escalation races and auth.
- Bot is keyword/overlap based — no LLM/embeddings, no Bengali stemming beyond prefix matching, English only via a few keywords.
- Citizens are anonymous; no notification (SMS/email) when an officer replies — the citizen must keep the chat open (or reopen it from "recent"). Needs a contact channel + provider.
- Sessions: no server-side revocation list beyond deactivating the account; no MFA.
- Search uses regex over `searchText` (fine for thousands of chats; use Atlas Search beyond that).
- Old phase-1–4 notes above that mention `localStorage` are historical.
