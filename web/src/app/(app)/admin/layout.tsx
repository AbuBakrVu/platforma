import { requireStaff } from "@/lib/auth";

/** Разделы управления открываются из бокового меню сотрудника; здесь — только проверка, что это сотрудник */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireStaff();
  return children;
}
