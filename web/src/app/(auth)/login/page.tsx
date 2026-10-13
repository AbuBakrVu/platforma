import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthCard } from "./AuthCard";
import s from "./auth.module.css";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { mode, code } = await searchParams;
  // Старые ссылки-приглашения /register?code=… и ?mode=signup ведут на регистрацию
  if (typeof code === "string" && code) redirect(`/register?code=${encodeURIComponent(code)}`);
  if (mode === "signup") redirect("/register");
  return (
    <main className={s.page}>
      <AuthCard />
    </main>
  );
}
