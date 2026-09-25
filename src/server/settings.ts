import "server-only";
import { col } from "./db";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "@/lib/settings";

export async function getSettings(): Promise<Settings> {
  const doc = await (await col.settings()).findOne({ _id: "main" });
  if (!doc) return DEFAULT_SETTINGS;
  const { _id, ...rest } = doc;
  void _id;
  return mergeSettings(rest);
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await col.settings()).replaceOne({ _id: "main" }, s, { upsert: true });
}
