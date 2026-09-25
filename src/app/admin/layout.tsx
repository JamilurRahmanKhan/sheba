import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { getSessionUser } from "@/server/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Authoritative check (the proxy only looks for a cookie): valid signature, active account.
  if (!(await getSessionUser())) redirect("/login?next=/admin");
  return (
    <div className="view">
      <div className="shell">
        <AdminSidebar />
        <div className="shell-main">{children}</div>
      </div>
    </div>
  );
}
