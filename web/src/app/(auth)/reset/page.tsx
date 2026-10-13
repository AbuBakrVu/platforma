import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { ResetForm } from "./ResetForm";
import s from "../login/auth.module.css";

export const metadata = { title: "Восстановление пароля" };

export default async function ResetPage() {
  if (await getUser()) redirect("/");
  return <main className={s.page}><ResetForm enabled={mailEnabled()} /></main>;
}
