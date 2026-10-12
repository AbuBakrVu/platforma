import { requireStaff } from "@/lib/auth";
import { eq, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { AdminTabs } from "@/components/AdminTabs";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();
  const [q] = await db.select({ n: sql<number>`count(*)::int` }).from(t.submissions).where(eq(t.submissions.status, "submitted"));
  return (
    <>
      <AdminTabs isAdmin={user.role === "admin"} toReview={q.n} />
      {children}
    </>
  );
}
