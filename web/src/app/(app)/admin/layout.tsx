import { requireStaff } from "@/lib/auth";
import { AdminTabs } from "@/components/AdminTabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  return (
    <>
      <AdminTabs isAdmin={user.role === "admin"} />
      {children}
    </>
  );
}
