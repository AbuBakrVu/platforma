import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthCard } from "./AuthCard";
import s from "./auth.module.css";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { mode, code } = await searchParams;
  const invite = typeof code === "string" ? code : "";
  return (
    <main className={s.page}>
      <AuthCard initial={mode === "signup" || invite ? "signup" : "signin"} code={invite} />
    </main>
  );
}
