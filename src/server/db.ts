import "server-only";
import { MongoClient, type Collection, type Db } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";
import type { Conversation, LogMessage, Outcome } from "@/lib/conversations";
import type { Escalation, KbItem } from "@/lib/data";
import type { Role, Settings } from "@/lib/settings";

/* ---------------- document shapes (ids are stored as string `_id`s) ---------------- */

export type ConversationDoc = Omit<Conversation, "id"> & {
  _id: string;
  /** sha256 of the secret the citizen's browser holds; never sent to clients */
  tokenHash: string;
  /** denormalised so the admin list can filter/sort/paginate in the database */
  outcome: Outcome;
  firstQuestion: string;
  userMessages: number;
  messageCount: number;
  lastMessageAt: string;
  searchText: string;
  messages: LogMessage[];
};

export type EscalationDoc = Omit<Escalation, "id" | "time"> & { _id: string; conversationId?: string };
export type KbDoc = Omit<KbItem, "id"> & { _id: string };
export type SettingsDoc = Settings & { _id: "main" };

export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  role: Role;
  title: string;
  active: boolean;
  passwordHash: string;
  createdAt: string;
  failedLogins: number;
  lockUntil?: string;
}

export interface RateLimitDoc {
  _id: string;
  n: number;
  expireAt: Date;
}

export interface CounterDoc {
  _id: string;
  seq: number;
}

/* ---------------- connection ---------------- */

const globalForMongo = globalThis as unknown as { __sebaMongo?: { client: MongoClient; indexes?: Promise<void> } };

function getClient(): { client: MongoClient; indexes?: Promise<void> } {
  if (!globalForMongo.__sebaMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.");
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000, ignoreUndefined: true });
    // On Vercel (Fluid compute) this lets idle connections drain before a function instance is suspended.
    if (process.env.VERCEL) attachDatabasePool(client);
    globalForMongo.__sebaMongo = { client };
  }
  return globalForMongo.__sebaMongo;
}

export async function getDb(): Promise<Db> {
  const state = getClient();
  const db = state.client.db(process.env.MONGODB_DB || "seba_sohayok");
  state.indexes ??= ensureIndexes(db).catch((err) => {
    state.indexes = undefined; // retry on next request
    throw err;
  });
  await state.indexes;
  return db;
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("conversations").createIndex({ lastMessageAt: -1 }),
    db.collection("conversations").createIndex({ outcome: 1, startedAt: -1 }),
    db.collection("conversations").createIndex({ topic: 1, startedAt: -1 }),
    db.collection("conversations").createIndex({ escalationId: 1 }, { sparse: true }),
    db.collection("escalations").createIndex({ status: 1, createdAt: -1 }),
    db.collection("escalations").createIndex({ assignee: 1 }),
    db.collection("escalations").createIndex({ conversationId: 1 }, { sparse: true }),
    db.collection("kb").createIndex({ category: 1 }),
    db.collection("ratelimits").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export const col = {
  users: async (): Promise<Collection<UserDoc>> => (await getDb()).collection<UserDoc>("users"),
  conversations: async (): Promise<Collection<ConversationDoc>> => (await getDb()).collection<ConversationDoc>("conversations"),
  escalations: async (): Promise<Collection<EscalationDoc>> => (await getDb()).collection<EscalationDoc>("escalations"),
  kb: async (): Promise<Collection<KbDoc>> => (await getDb()).collection<KbDoc>("kb"),
  settings: async (): Promise<Collection<SettingsDoc>> => (await getDb()).collection<SettingsDoc>("settings"),
  counters: async (): Promise<Collection<CounterDoc>> => (await getDb()).collection<CounterDoc>("counters"),
  rateLimits: async (): Promise<Collection<RateLimitDoc>> => (await getDb()).collection<RateLimitDoc>("ratelimits"),
};

/** Atomic sequential ids, safe under concurrent serverless instances. */
export async function nextSeq(name: string, start = 0): Promise<number> {
  const counters = await col.counters();
  const doc = await counters.findOneAndUpdate(
    { _id: name },
    [{ $set: { seq: { $add: [{ $ifNull: ["$seq", start] }, 1] } } }],
    { upsert: true, returnDocument: "after" },
  );
  return doc!.seq;
}
