import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { VerifyForm } from "./VerifyForm";
import s from "../login/auth.module.css";

export const metadata = { title: "Подтверждение почты" };

export default async function VerifyPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.emailVerified || !mailEnabled()) redirect("/");
  return <main className={s.page}><VerifyForm email={user.email} /></main>;
}
