"use server";

import { redirect } from "next/navigation";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { consumeInvite } from "@/lib/invites";

export type AuthState = { error?: string; email?: string; name?: string; code?: string };

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
  const code = String(form.get("code") ?? "").trim();
  const back = { email, name, code };

  if (!code) return { ...back, error: "Нужен код приглашения — его выдаёт администратор" };
  if (name.length < 2) return { ...back, error: "Укажите имя" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ...back, error: "Проверьте email" };
  if (password.length < 8) return { ...back, error: "Пароль — минимум 8 символов" };

  const [exists] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.email, email)).limit(1);
  if (exists) return { ...back, error: "Этот email уже зарегистрирован" };

  const passwordHash = await hashPassword(password);
  const userId = await db.transaction(async (tx) => {
    const invite = await consumeInvite(tx, code);
    if (!invite) return null; // транзакция ничего не изменила
    const [user] = await tx.insert(schema.users)
      .values({ name, email, passwordHash, role: invite.role, groupId: invite.groupId })
      .onConflictDoNothing()
      .returning({ id: schema.users.id });
    if (!user) tx.rollback(); // email заняли параллельно — возвращаем использование кода
    return user.id;
  }).catch((e) => {
    if (e instanceof TransactionRollbackError) return undefined;
    throw e;
  });

  if (userId === null) return { ...back, error: "Код недействителен, истёк или уже использован" };
  if (!userId) return { ...back, error: "Этот email уже зарегистрирован" };
  await createSession(userId);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
