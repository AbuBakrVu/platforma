import { requireUser } from "@/lib/auth";
import { getDueCount, getGroupName } from "@/lib/queries";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [group, due] = await Promise.all([getGroupName(user.groupId), getDueCount(user.id)]);
  return (
    <div className="app">
      <Sidebar name={user.name} role={user.role} group={group} due={due} />
      <main className="main">{children}</main>
    </div>
  );
}
