"use client";

import useSWR from "swr";
import { fetcher } from "./api";
import type { Settings, TeamMember } from "./settings";
import type { Lang } from "./i18n";
import type { TopicId } from "./data";

export interface PublicConfig {
  greeting: string;
  maintenance: boolean;
  handoffEnabled: boolean;
  offHoursMessage: string;
  slaMinutes: number;
  inHours: boolean;
  hoursSummary: string;
  topics: { id: TopicId; label: string; sample: string }[];
}

export const usePublicConfig = () => useSWR<PublicConfig>("/api/public/config", fetcher, { refreshInterval: 60_000, revalidateOnFocus: true });

/** Admin-side settings (requires a session). Pass `enabled=false` to skip. */
export const useSettings = (enabled = true) => useSWR<{ settings: Settings }>(enabled ? "/api/admin/settings" : null, fetcher, { revalidateOnFocus: true });

export const useTeam = () => useSWR<{ team: TeamMember[] }>("/api/admin/team", fetcher);

export type { Lang };
