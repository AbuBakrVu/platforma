"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

export type AuthState = { error?: string; email?: string; name?: string };

const normEmail = (v: FormDataEntryValue | null) => String(v ?? "").trim().toLowerCase();

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = normEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Введите email и пароль", email };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Неверный email или пароль", email };
  }
  await createSession(user.id);
  redirect("/");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim();
  const email = normEmail(form.get("email"));
  const password = String(form.get("password") ?? "");
  const back = { email, name };

  if (name.length < 2) return { ...back, error: "Укажите имя" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ...back, error: "Проверьте email" };
  if (password.length < 8) return { ...back, error: "Пароль — минимум 8 символов" };

  const [exists] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, email)).limit(1);
  if (exists) return { ...back, error: "Этот email уже зарегистрирован" };

  const [user] = await db.insert(schema.users)
    .values({ name, email, passwordHash: await hashPassword(password) })
    .returning({ id: schema.users.id });
  await createSession(user.id);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
