/**
 * Seeds the database.
 *   npm run seed                 -> admin (from ADMIN_EMAIL/ADMIN_PASSWORD) only
 *   npm run seed -- --kb         -> + the starter knowledge base (only if the KB is empty) — safe for production
 *   npm run seed -- --demo       -> + demo conversations, hand-offs, knowledge base, demo officers (local DB only)
 * Never run with --demo against a production database that holds real data (it replaces business data).
 */
import { ensureBootstrapAdmin } from "../src/server/auth";
import { col } from "../src/server/db";
import { resetToDemo, seedDemoOfficers } from "../src/server/data";
import { saveSettings } from "../src/server/settings";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import { SEED_KB } from "../src/lib/data";

async function main() {
  const demo = process.argv.includes("--demo");
  const local = /(^|@|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.MONGODB_URI ?? "");
  if (demo && !local && !process.argv.includes("--force")) {
    console.error("Refusing to load DEMO data (replaces data, creates accounts with a known password) into a non-local database.\nPass --force only if you are sure this is a throwaway database.");
    process.exit(1);
  }
  await ensureBootstrapAdmin();
  const users = await col.users();
  const admins = await users.countDocuments({ role: "admin" });
  console.log(admins ? `Admin account ready (${admins}).` : "No admin exists — set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local and rerun.");

  if (demo) {
    await resetToDemo();
    const pw = process.env.SEED_OFFICER_PASSWORD || "demo-officer-123";
    const n = await seedDemoOfficers(pw);
    console.log(`Demo data loaded. Demo officers created: ${n} (password: ${pw}) — DEV ONLY.`);
  } else if (process.argv.includes("--kb")) {
    const kb = await col.kb();
    if ((await kb.estimatedDocumentCount()) === 0) {
      await kb.insertMany(SEED_KB.map(({ id, ...k }) => ({ _id: id, ...k, uses: 0 })));
      console.log(`Starter knowledge base loaded (${SEED_KB.length} entries).`);
    } else console.log("Knowledge base already has entries — left untouched.");
    if (!(await (await col.settings()).findOne({ _id: "main" }))) await saveSettings(DEFAULT_SETTINGS);
  } else if (!(await (await col.settings()).findOne({ _id: "main" }))) {
    await saveSettings(DEFAULT_SETTINGS);
    console.log("Default settings saved.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
