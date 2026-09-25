import type { Metadata } from "next";
import { KbView } from "@/components/KbView";

export const metadata: Metadata = { title: "নলেজ বেস · সেবা সহায়ক AI" };

export default function KbPage() {
  return <KbView />;
}
