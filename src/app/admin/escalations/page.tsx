import type { Metadata } from "next";
import { EscalationsView } from "@/components/EscalationsView";

export const metadata: Metadata = { title: "হস্তান্তরকৃত প্রশ্ন · সেবা সহায়ক AI" };

export default function EscalationsPage() {
  return <EscalationsView />;
}
