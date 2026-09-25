# সরকারি সেবা সহায়ক AI

Bengali-first citizen-service assistant for a government office: a public chat, an officer desk for
human hand-offs, a knowledge base the bot answers from, and an admin panel.

**Stack:** Next.js 16 (App Router) · TypeScript · MongoDB (native driver) · Vercel · SWR · zod · jose + bcryptjs (sessions)

```
Browser ──► Next.js on Vercel ──► MongoDB Atlas
 citizen chat (public)   /api/chat/*, /api/public/*   conversations, escalations, kb, settings, users, counters
 staff panel (login)     /api/admin/*, /api/auth/*
```

## Local development

Requires Node 20+ and a MongoDB (a throwaway Docker one is fine):

```bash
docker run -d --name seba-mongo -p 127.0.0.1:27017:27017 -v seba-mongo-data:/data/db mongo:7

cp .env.example .env.local        # then fill it in (see below)
npm install
npm run seed -- --demo            # demo chats/cases/KB + demo officers (local DB only)
npm run dev                       # http://localhost:3000
```

`.env.local` for local dev:

```
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=seba_sohayok
SESSION_SECRET=<openssl rand -base64 48>
CRON_SECRET=<openssl rand -hex 24>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<8+ chars>
```

Sign in at `/login` (the citizen chat at `/chat` needs no login). The first login creates the admin
from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if no users exist yet.
Demo officers created by `--demo`: `rafia@demo.local`, `tanvir@demo.local`, `mahmuda@demo.local`
(password from `SEED_OFFICER_PASSWORD`, default `demo-officer-123`) — **development only**.

## Deploying to Vercel + MongoDB Atlas

1. **Atlas:** create a cluster (M0 free is fine), a database user, and under *Network Access* allow
   Vercel to connect. Vercel functions do not have fixed IPs, so either use the **Vercel ↔ MongoDB Atlas
   Marketplace integration** (it wires this up and sets `MONGODB_URI` for you) or allow `0.0.0.0/0`
   and rely on a strong database password. Copy the `mongodb+srv://…` connection string.
2. **Vercel:** import the Git repository (or run `vercel` from this folder). Framework preset: Next.js.
3. **Environment variables** (Project → Settings → Environment Variables, Production):

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | Atlas connection string |
   | `MONGODB_DB` | `seba_sohayok` |
   | `SESSION_SECRET` | random, ≥ 32 chars (`openssl rand -base64 48`) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | first admin (created on first login) |
   | `CRON_SECRET` | random; Vercel Cron sends it as a Bearer token |

4. **Deploy.** Open `/login`, sign in as the admin, then change the password under *Settings → সাধারণ*
   and create officer accounts under *Settings → টিম*.
5. **(Optional) starter knowledge base** for a fresh production database (does not create demo data):
   ```bash
   MONGODB_URI="<atlas uri>" npm run seed -- --kb
   ```
   (`--demo` is refused on non-local databases.)

`vercel.json` schedules a daily retention job (`/api/cron/retention`, 20:00 UTC = 02:00 Bangladesh time)
that deletes finished conversations older than the retention period set in *Settings → ডেটা ও গোপনীয়তা*.

## How it works

- **Bot:** `src/server/bot.ts` answers from the *active* knowledge-base entries (keyword → topic, then best
  match within the topic; admin-added entries on new subjects work too). Unanswered questions appear in
  the conversation log, where an admin can turn them into KB entries.
- **Hand-off:** a citizen escalates → a case is created (atomic; a double click cannot create two) → an
  officer accepts (atomic; two officers cannot both accept) → replies appear in the citizen's chat within
  ~4 s (polling) → resolve with a summary → optionally add the resolution to the KB.
- **Auth:** signed, `httpOnly`, `SameSite=Lax` session cookie (7 days). The user is re-checked in the
  database on every request, so deactivating an account takes effect immediately. Roles: **admin**
  (everything) and **officer** (conversations, hand-offs, knowledge base). `proxy.ts` is only an optimistic
  redirect; every `/api/admin/*` route enforces authorisation itself.
- **Citizen privacy:** chats are anonymous. A random per-conversation secret (only its hash is stored)
  authorises the citizen's own polling/escalation/rating calls.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint |
| `npm run seed [-- --kb \| --demo]` | seed the database (see `scripts/seed.ts`) |

See `docs/decisions.md` for design decisions and known gaps.
