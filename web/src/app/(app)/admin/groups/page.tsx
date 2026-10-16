import { redirect } from "next/navigation";

/** Потоков больше нет: доступ к курсам — запись ученика на курс. Старый адрес ведёт к людям. */
export default function GroupsPage() {
  redirect("/admin/users");
}
