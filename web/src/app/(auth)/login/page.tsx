import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthCard } from "./AuthCard";
import s from "./auth.module.css";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { mode } = await searchParams;
  return (
    <main className={s.page}>
      <AuthCard initial={mode === "signup" ? "signup" : "signin"} />
    </main>
  );
}
