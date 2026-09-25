import type { Metadata } from "next";
import { DashboardView } from "@/components/DashboardView";

export const metadata: Metadata = { title: "ড্যাশবোর্ড · সেবা সহায়ক AI" };

export default function AdminPage() {
  return <DashboardView />;
}
