import { requireUser } from "@/lib/auth";
import { getGroupName } from "@/lib/queries";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const group = await getGroupName(user.groupId);
  return (
    <div className="app">
      <Sidebar name={user.name} role={user.role} group={group} />
      <main className="main">{children}</main>
    </div>
  );
}
