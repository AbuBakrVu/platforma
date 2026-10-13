import { redirect } from "next/navigation";

/** Бывший «Обзор» управления: теперь всё на главной сотрудника */
export default function AdminHome() {
  redirect("/");
}
