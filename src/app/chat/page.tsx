import type { Metadata } from "next";
import { ChatView } from "@/components/ChatView";

export const metadata: Metadata = { title: "চ্যাট · সেবা সহায়ক AI" };

export default function ChatPage() {
  return <ChatView />;
}
