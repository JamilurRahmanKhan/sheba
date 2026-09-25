import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversationsView } from "@/components/ConversationsView";

export const metadata: Metadata = { title: "কথোপকথন লগ · সেবা সহায়ক AI" };

export default function ConversationsPage() {
  return (
    <Suspense>
      <ConversationsView />
    </Suspense>
  );
}
