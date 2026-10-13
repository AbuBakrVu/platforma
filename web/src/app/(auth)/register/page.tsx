import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { mailEnabled } from "@/lib/mail";
import { RegisterForm } from "./RegisterForm";
import s from "../login/auth.module.css";

export const metadata = { title: "Регистрация" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  if (await getUser()) redirect("/");
  const { code } = await searchParams;
  return (
    <main className={s.page}>
      <RegisterForm code={typeof code === "string" ? code : ""} verify={mailEnabled()} />
    </main>
  );
}
