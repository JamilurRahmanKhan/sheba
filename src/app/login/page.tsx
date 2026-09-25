import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = { title: "স্টাফ লগইন · সেবা সহায়ক AI" };

/** Only same-site relative paths are accepted as a post-login destination (no open redirects). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  if (await getSessionUser()) redirect(next);
  return (
    <div className="login-wrap">
      <LoginForm next={next} />
    </div>
  );
}
