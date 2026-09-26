# সরকারি সেবা সহায়ক AI — Full System Guide

*Government Service Assistant AI: what it is, what it provides, and how to use, run and maintain it.*

- Live site: https://sheba-steel.vercel.app
- Source: https://github.com/JamilurRahmanKhan/sheba
- Languages: Bengali (default) and English (UI toggle in the top bar)

---

## 1. What the system is

A web service that lets **citizens ask questions about Bangladesh government services** and get instant, accurate answers in Bengali or English — and lets **government staff** manage the answers, take over conversations that need a human, and watch performance.

It has two sides:

| Side | Who | Login | Where |
|---|---|---|---|
| **Citizen chat** | Anyone | None (anonymous) | `/chat` |
| **Staff panel** | Admins and officers | Email + password | `/admin/*` |

### The service it provides to citizens

1. **Instant answers, 24/7**, to questions about: birth registration, national ID (NID), passport services, trade licence, land & khatian, social-security allowances, income tax & VAT, and complaints.
2. **Free-form questions** in Bengali, English or romanised Bengali ("passport banate koto taka lagbe"). The AI understands the question and answers from the office's approved knowledge base — it never invents fees, links or procedures.
3. **Follow-up buttons** ("ফি কত?", "কী কাগজ লাগবে?") and short memory of the topic, so "fee koto?" after an NID question gets the NID fee.
4. **Human hand-off**: if the bot cannot help, the citizen can talk to a real officer. The officer's reply appears in the same chat within seconds.
5. **Rating** (1–5 stars) after a conversation.
6. **Privacy by default**: no account, no name required; phone / NID / email numbers typed into the chat are masked before storage.

### The service it provides to staff

1. **Dashboard**: today's volume, hand-off status counts, top topics (30 days), bot answer rate and average satisfaction.
2. **Conversation log**: every conversation, filterable and reviewable; unanswered questions can be turned into knowledge-base entries in one click.
3. **Knowledge base**: the single source of truth the bot answers from — add, edit, disable, delete, alternative phrasings, and a "test the bot" box.
4. **Hand-off desk**: a work queue of citizen requests for human help, with priority, assignment, saved replies, internal notes, working-hours SLA and resolution summaries.
5. **Settings**: organisation name, hand-off policy, office hours, bot messages, AI on/off, maintenance mode, team accounts, backups, retention and an audit log.

---

## 2. How citizens use it

1. Open **/chat** (no login). The greeting appears with topic buttons.
2. **Ask** by typing, or tap a topic / follow-up button.
3. Read the answer. Answers written by the AI are marked in the staff transcript as "AI-generated".
4. If the answer is not enough, click **"উত্তরে সন্তুষ্ট নন? মানব প্রতিনিধির সাথে কথা বলুন" / "Not satisfied? Talk to a human agent"**.
   - During office hours: the citizen is told an agent will join within the SLA (default 15 minutes).
   - Outside office hours: the request is recorded and the citizen is told an agent will join on the next working day.
5. When an officer accepts, a notice appears ("প্রতিনিধি … যুক্ত হয়েছেন"). Officer replies show up automatically (the chat checks for new messages every ~4 seconds).
6. When the officer resolves the case, the bot resumes answering. The citizen can rate the conversation.
7. **Resume later**: the chat remembers the conversation in the browser; "সাম্প্রতিক কথোপকথন / Recent conversations" lists the last five. **"+ নতুন / + New"** starts a fresh chat.
8. **Language**: the বাংলা / English toggle changes the whole interface (see limits in §10).

What the bot will and will not do:

- It answers **only government-service questions covered by the knowledge base**.
- If it cannot find a grounded answer (weather, jokes, services not in the knowledge base) it says it did not understand, shows the topic buttons again, and offers a human.
- It ignores attempts to change its rules ("ignore previous instructions…").
- While a human case is open, the bot stays silent so it never talks over an officer.

---

## 3. How staff use it

### 3.1 Signing in

`/login` → email + password. Accounts lock for 15 minutes after 5 failed attempts. Sessions last 7 days; **"Log out of all devices"** (Settings → General) ends every session.

**Roles**

| Role | Can do |
|---|---|
| **Admin** | Everything: dashboard, conversations (incl. delete), hand-offs, knowledge base, all Settings tabs (team, data, audit, bot, AI) |
| **Officer** | Dashboard, conversations, hand-offs, knowledge base, own password change. No team management, settings, backups or deletions |

The first admin is created automatically on the first login from the `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables when no users exist. Add officers and further admins in **Settings → Team**.

### 3.2 Dashboard (`/admin`)

- **Cards**: conversations today; hand-offs *New / In progress / Resolved*. Click a hand-off card to filter the table below; click again to clear.
- **Top topics (30 days)**: share of questions per topic.
- **Bot answer rate (7 days)** with change vs. the previous week — shown only once there are at least 10 conversations, so small samples don't mislead.
- **Average satisfaction** from citizen ratings.
- **Hand-off table**: accept a new case directly, or open it.
- Data refreshes automatically (polling).

### 3.3 Conversation log (`/admin/conversations`)

- **Stat cards** (total, bot answered, handed off, unanswered) that double as filters.
- **Filters**: text search (ID, question or note), topic, period (all / today / 7 / 30 days), review status (pending / reviewed / flagged), sort (newest, oldest, most messages, lowest rating); paginated.
- **Open a conversation** to read the full transcript with timestamps, see outcome, duration, language, topic and citizen rating.
- **Review workflow**: *Mark reviewed*, *Flag for improvement*, and an internal **note**.
- **Add to knowledge base**: on an *Unanswered* conversation, one click opens a pre-filled knowledge-base form; saving it also marks the conversation reviewed, so the next citizen gets a real answer.
- **Export CSV** of the current filter. **Delete** (admin only) permanently removes a conversation.

Outcomes: **Bot answered** (no fallback), **Handed off**, **Unanswered** (the bot fell back at least once).

### 3.4 Knowledge base (`/admin/kb`)

Each entry: question, category (one of the 8 topics), answer, optional **alternative phrasings** (one per line), active/inactive, usage counter, last update.

- **Add / edit / delete**; **toggle Active** to pause an entry without deleting it. Only active entries are used.
- **Alternative phrasings** teach the bot other ways citizens ask the same thing.
- **Duplicate check**: adding a question that already exists is refused with a pointer to the existing entry.
- **Search** across questions, answers and phrasings; **category tabs** to filter.
- **Test the bot**: type a question and see exactly what the bot would answer right now and where the answer came from (knowledge-base entry / AI from the knowledge base / topic default / no match). Nothing is saved.

Tips: write answers as a citizen would need them (steps, fee, time, links). The AI can only answer what is written here — if citizens ask about a service that is missing, add an entry.

### 3.5 Hand-off desk (`/admin/escalations`)

A hand-off is created when a citizen asks for a human. Lifecycle: **New → In progress → Resolved** (and *Reopen*).

- **Stat cards**: totals, urgent-open count, number past SLA, average first response and average resolution time (all measured in **working hours**).
- **Filters**: text, department, priority, assignee (everyone / mine / unassigned / a person), sort (work queue with urgent first, newest, oldest).
- **Open a case** to see: the citizen, department, timing, linked conversation, full transcript, and the activity timeline.
- **Accept** — atomic: if two officers click at once, exactly one wins and the other is told.
- **Reply to the citizen** — allowed once accepted; appears in the citizen's chat within seconds. **Saved replies** (templates from Settings) insert with one click and can be edited first.
- **Internal notes** — visible to staff only.
- **Priority** (normal/urgent) and **assignee** can be changed at any time.
- **Resolve** — requires a resolution summary. The citizen is notified in the chat and the bot resumes.
- **Reopen** a resolved case; **Add to knowledge base** from a resolved case so the answer is reusable.
- **SLA**: a new case not accepted within the configured minutes (default 15, counted only inside working hours) is flagged red "past SLA".
- **Alerts**: the sidebar shows a badge with waiting cases, the browser tab title shows "(n)", a sound plays and a toast appears when a new case arrives; optional desktop notifications. The sound can be muted from the sidebar.
- **Export CSV**.

### 3.6 Settings (`/admin/settings`, admin only except own password)

| Tab | What you control |
|---|---|
| **General** | Panel name and department name (sidebar), language and theme for this browser, **change my password**, **log out of all devices** |
| **Hand-off & schedule** | Show/hide the "talk to a human" link; SLA minutes; working days and hours (Bangladesh time) with a live "within/outside office hours" indicator; the message shown outside hours; **saved reply templates** (up to 20) |
| **Bot** | **AI-powered answers** on/off (with connection status); welcome message; "no answer" message; restore both to defaults; **maintenance mode** (bot stops answering and the chat shows a warning; hand-offs still work) and its message |
| **Team** | Add members (name, email, initial password, title, role); change title/role; activate/deactivate; reset a password. Members cannot be renamed or deleted (history stays intact) — only deactivated. At least one active admin must always remain |
| **Data & privacy** | **Retention period** (0 = forever, otherwise 7–3650 days) with a "clean up now" action; **backup** (download JSON) and **restore**; **reset to demo data** (disabled in production) |
| **Audit log** | Permanent record of who did what and when (logins, password changes, settings, team, knowledge base, data actions, conversation deletions), filterable and searchable; kept ~13 months |

Changes made here apply immediately to the chat and the panel. A save bar appears when there are unsaved changes.

---

## 4. How the AI answers work

Every citizen message goes through these steps, in order:

1. **Mask personal data** (phone, NID, email) before anything is stored or sent.
2. **A human owns the chat?** If a case is open, the bot stays silent.
3. **Maintenance mode?** Show the maintenance message.
4. **Follow-up button?** Return the stored follow-up answer.
5. **Strong knowledge-base match** → send that entry **word for word** (fast, free, cannot hallucinate).
6. **Otherwise, if AI is on and configured** → the model receives the best-matching knowledge-base entries (plus the topic's standard answers) and the last few messages. It must answer **only** from them and name the entries it used.
   - Valid answer → sent (marked "AI").
   - Model says it cannot answer → the citizen gets the honest "I didn't understand" message (no loosely-related answer).
   - Technical failure (timeout, busy, no credits, budget spent) → automatic fallback to step 7.
7. **Keyword bot**: topic keywords (Bengali, English, romanised) → best knowledge-base entry in the topic → the topic's fee/time/documents follow-up if the question is about that → the topic's standard answer → otherwise the fallback message.

Safety and cost controls:

- The AI is instructed to never invent fees, deadlines, websites, phone numbers or procedures; answers that don't cite valid entries are discarded.
- The citizen's text and the knowledge text are treated as data, not instructions (prompt-injection resistant).
- Limits: 20 AI calls per conversation per hour and `LLM_DAILY_LIMIT` (default 3000) per day for the whole site. When exceeded, the keyword bot takes over silently.
- Busy provider → up to 3 attempts within ~16 s, switching to `LLM_FALLBACK_MODEL` on the second try.
- Admins can switch AI off any time (Settings → Bot). Privacy note: with AI on, the citizen's (already masked) question is sent to the external AI provider.

Current provider: Google Gemini through its OpenAI-compatible endpoint (`gemini-3.5-flash-lite`, fallback `gemini-3.8-flash`). Any OpenAI-compatible gateway works.

---

## 5. Architecture

```
Browser ──► Next.js 16 (App Router) on Vercel ──► MongoDB Atlas
  /chat (public)         /api/chat/*, /api/public/*        conversations, escalations, kb,
  /admin/* (login)       /api/admin/*, /api/auth/*         settings, users, counters,
                         /api/cron/retention, /api/health  audit, ratelimits
                                    │
                                    └──► AI provider (Gemini / any OpenAI-compatible API)
```

- **Frontend**: React 19 + TypeScript; SWR polling for live staff views; the citizen chat polls every ~4 s. UI styling ported from the original prototype (`src/app/globals.css`).
- **Backend**: Next.js route handlers wrapped in a common error/auth layer; input validated with zod; JSON-only bodies (CSRF-resistant).
- **Database**: MongoDB (native driver). String ids (`CV-1001`, `VB-2026-0217`, `q1`, …) from atomic counters. TTL indexes expire rate-limit and audit records.
- **Auth**: signed JWT in an `httpOnly`, `SameSite=Lax`, `Secure` cookie (7 days); user re-checked in the database on every request, so deactivation and password changes take effect immediately. Passwords hashed with bcrypt.
- **Timezone**: Asia/Dhaka for office hours, SLA and dates.
- **Scheduled job**: `/api/cron/retention` runs daily (02:00 Bangladesh time) and deletes finished conversations older than the retention period (never those with an open hand-off).
- **Pages**: `/chat`, `/login`, `/admin` (dashboard), `/admin/conversations`, `/admin/kb`, `/admin/escalations`, `/admin/settings`.

### Data collections

| Collection | Holds |
|---|---|
| `conversations` | Messages, topic, outcome, rating, review/flag/note, hand-off link, hashed citizen token |
| `escalations` | Hand-off cases: status, priority, assignee, activity timeline, resolution, timings |
| `kb` | Knowledge-base entries |
| `settings` | One document with all settings |
| `users` | Staff accounts (hashed passwords, role, active, lockout, session version) |
| `counters` | Sequential id generators |
| `audit` | Audit trail (TTL ~13 months) |
| `ratelimits` | Shared rate-limit counters (TTL) |

### Security and privacy summary

- Citizens are anonymous. Each conversation has a random secret (only its hash is stored) that authorises that citizen's own polling, hand-off and rating requests.
- Phone numbers, NID numbers and email addresses are masked before storage and before any AI call.
- Login, chat, hand-off and rating calls are rate-limited across all serverless instances; login lockout after 5 failures.
- Every `/api/admin/*` route enforces its own authorisation; the proxy redirect is only a convenience.
- Security headers are set on all responses; backups exclude accounts and passwords.
- Concurrency is safe: five simultaneous hand-off clicks create one case; two officers accepting the same case → one wins.

---

## 6. API reference (summary)

Public (no login):

| Method & path | Purpose |
|---|---|
| `GET /api/public/config` | Greeting, topics, working-hours status, SLA, maintenance flag |
| `POST /api/chat/messages` | Send a message (creates the conversation on first message); returns new messages |
| `GET /api/chat/{id}?after=n&token=…` | Poll for new messages / hand-off status |
| `POST /api/chat/{id}/escalate` | Ask for a human |
| `POST /api/chat/{id}/rating` | Rate 1–5 |

Auth: `POST /api/auth/login`, `logout`, `logout-all`, `password`; `GET /api/auth/me`.

Staff (login required; role noted):

| Path | Purpose |
|---|---|
| `/api/admin/dashboard`, `/alerts` | Dashboard statistics; new-case alert counters |
| `/api/admin/conversations` (+ `/{id}`, `/export`) | List/filter, read, update review/flag/note, delete (admin), CSV |
| `/api/admin/escalations` (+ `/{id}`, `/export`) | List/filter, accept, reply, note, priority, assign, resolve, reopen, CSV |
| `/api/admin/kb` (+ `/{id}`, `/test`) | Knowledge-base CRUD and bot test |
| `/api/admin/settings` (admin) | Read/replace settings; includes `aiConfigured` / `aiModel` |
| `/api/admin/team` (+ `/{id}`) (admin) | Members |
| `/api/admin/audit` (admin) | Audit log |
| `/api/admin/data/{export,import,reset,purge,stats}` (admin) | Backup, restore, demo reset, retention purge |

Operations: `GET /api/cron/retention` and `GET /api/health` (both require `Authorization: Bearer $CRON_SECRET`; health reports database and configuration problems by name only, never secret values).

---

## 7. Configuration (environment variables)

| Variable | Required | Meaning |
|---|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Yes | Database connection and name |
| `SESSION_SECRET` | Yes | Random string, ≥ 32 characters, signs sessions |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | First run | First admin, created on the first login when no users exist |
| `CRON_SECRET` | Yes (for cron/health) | Bearer secret for the retention job and health check |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | For AI | Any OpenAI-compatible endpoint, e.g. `https://generativelanguage.googleapis.com/v1beta/openai`, `gemini-3.5-flash-lite` |
| `LLM_FALLBACK_MODEL` | Optional | Second-attempt model when the main one is busy, e.g. `gemini-3.8-flash` |
| `LLM_DAILY_LIMIT` | Optional | Daily AI-call cap for the whole site (default 3000) |
| `ALLOW_DEMO_RESET` | Never in production | Enables "reset to demo data" |

Environment changes on Vercel apply to **new deployments only** — redeploy after changing them.

---

## 8. Deploying and running

**Local development** (Node 20+, MongoDB):

```bash
docker run -d --name seba-mongo -p 127.0.0.1:27017:27017 -v seba-mongo-data:/data/db mongo:7
cp .env.example .env.local     # fill in
npm install
npm run seed -- --demo         # demo data (local database only)
npm run dev
```

**Production** (Vercel + MongoDB Atlas): push to `main` → Vercel builds and deploys. Set the variables in §7 for Production, allow Vercel to reach Atlas (Atlas integration or `0.0.0.0/0` with a strong DB password), deploy, log in once to create the admin, then add officers. To load the starter knowledge base into a fresh database: `MONGODB_URI=… npm run seed -- --kb`.

**Quality checks**: `npm test` (78 tests, including concurrency tests against a real MongoDB), `npm run lint`, `npx tsc --noEmit`, `npm run build`. GitHub Actions runs them on every push.

### First-day checklist for a new office

1. Log in as admin → change the password; delete any accounts you don't need.
2. Settings → General: set the panel and department names.
3. Settings → Hand-off & schedule: set SLA, working days/hours, out-of-hours message, and saved replies.
4. Settings → Team: create an account for each officer.
5. Knowledge base: review the starter entries and add your office's real fees, links and procedures.
6. Settings → Bot: review the welcome and "no answer" messages; confirm AI status is *Connected*.
7. Test in `/chat` (and with the "test the bot" box), then share the chat link.

### Daily/weekly routine

- **Daily**: watch the hand-off queue and answer within the SLA.
- **Weekly**: open the conversation log filtered to *Unanswered*; add missing entries or alternative phrasings; mark conversations reviewed; check low ratings.
- **Monthly**: download a backup (Settings → Data), review the audit log, review AI usage/cost in the provider dashboard.

---

## 9. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Can't log in on the hosted site | The first admin comes from Vercel's `ADMIN_EMAIL`/`ADMIN_PASSWORD` (8+ chars). Another admin can reset passwords in Settings → Team |
| Every request fails | Atlas network access blocks Vercel, or wrong `MONGODB_URI` (`@` in a password must be `%40`). Call `/api/health` with the cron secret |
| Bot gives only generic answers | Knowledge base is empty or missing that topic — add entries |
| Settings shows AI "not configured" | One of `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` is missing on Vercel, or you haven't redeployed since adding it |
| AI stops answering | Provider credits/quota exhausted, key revoked, model retired, or the daily cap reached — the chat keeps working on keywords; check provider dashboard and `LLM_DAILY_LIMIT` |
| Answers are slow | Provider busy; the system retries and switches to the fallback model |
| Unanswered rate is high | Citizens ask about services not in the knowledge base — use the Unanswered filter and add entries |

---

## 10. Known limits and possible next steps

- **English mode** translates the whole interface, but bot answers come from the knowledge base, which is written in Bengali. English answers need English entries (or an "answer in the citizen's language" AI instruction). Audit-log details and text typed into Settings are shown as written.
- **No citizen notifications** outside the open chat (chats are anonymous — no phone/email is collected). If a citizen closes the page, they must reopen the chat to see the reply.
- **Staff sign-in** is email + password only (no MFA, no self-service password reset by email; an admin resets passwords).
- **Case ownership**: any officer may act on any case (assignment is a workflow marker, not a lock).
- **Topic categories are fixed** (8 topics); adding a new category needs a code change.
- **Real-time** is by polling (~4 s for citizens, 8–15 s for staff), not websockets.
- Suggested next steps: MFA and email password reset, SMS/WhatsApp notification with citizen consent, configurable topics, English knowledge-base entries, usage/cost dashboard for the AI.
