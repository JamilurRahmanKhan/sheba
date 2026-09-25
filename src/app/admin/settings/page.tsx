import type { Metadata } from "next";
import { SettingsView } from "@/components/SettingsView";

export const metadata: Metadata = { title: "সেটিংস · সেবা সহায়ক AI" };

export default function SettingsPage() {
  return <SettingsView />;
}
