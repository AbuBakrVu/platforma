import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq, and, gt, lt, or, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPassword, verifyPassword } from "@/db/password";
import { mailEnabled } from "./mail";
import { ALL_PERMS, isStaff, isStaffRole, TEACHER_DEFAULT, type Perm } from "./permissions";

export { hashPassword, verifyPassword };

const COOKIE = "session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

/** Сессия администратора, пока он смотрит платформу глазами другого пользователя */
const ADMIN_COOKIE = "admin_session";
const cookieOpts = (expires: Date) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.COOKIE_SECURE === "true", path: "/", expires });

/** Выход. Если это вход под пользователем — возвращаемся в свою сессию; вернёт id того, под кем смотрели. */
export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  let viewed: { id: string; actor: string } | null = null;
  if (token) {
    const [s] = await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token))).returning();
    if (s?.impersonatorId) viewed = { id: s.userId, actor: s.impersonatorId };
  }
  const back = jar.get(ADMIN_COOKIE)?.value;
  if (viewed && back) {
    jar.set(COOKIE, back, cookieOpts(new Date(Date.now() + SESSION_DAYS * 864e5)));
    jar.delete(ADMIN_COOKIE);
    await db.insert(schema.auditLog).values({ actorId: viewed.actor, targetId: viewed.id, action: "Завершил вход под пользователем" });
    return viewed.id;
  }
  jar.delete(COOKIE);
  jar.delete(ADMIN_COOKIE);
  return null;
}

/** Войти под пользователем (для поддержки): своя сессия откладывается, новая — на 2 часа, с отметкой, кто смотрит */
export async function impersonate(actorId: string, targetId: string) {
  const jar = await cookies();
  const mine = jar.get(COOKIE)?.value;
  if (!mine || jar.get(ADMIN_COOKIE)) return false; // уже смотрим чужими глазами — сначала вернитесь
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 2 * 3600_000);
  await db.insert(schema.sessions).values({ id: hashToken(token), userId: targetId, expiresAt, impersonatorId: actorId });
  jar.set(ADMIN_COOKIE, mine, cookieOpts(new Date(Date.now() + SESSION_DAYS * 864e5)));
  jar.set(COOKIE, token, cookieOpts(expiresAt));
  await db.insert(schema.auditLog).values({ actorId, targetId, action: "Вошёл под пользователем" });
  return true;
}

/** Текущий пользователь или null. Кешируется на время одного запроса. */
export const getUser = cache(async () => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      groupId: schema.users.groupId,
      external: schema.users.external,
      accessRoleId: schema.users.accessRoleId,
      lastSeenAt: schema.users.lastSeenAt,
      emailVerified: schema.users.emailVerified,
      impersonatorId: schema.sessions.impersonatorId,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  let perms: Perm[] = [];
  if (row.role === "admin") perms = ALL_PERMS;
  else if (row.role === "teacher") {
    const [r] = row.accessRoleId ? await db.select({ perms: schema.accessRoles.perms }).from(schema.accessRoles).where(eq(schema.accessRoles.id, row.accessRoleId)) : [];
    perms = r ? (r.perms.filter((p) => (ALL_PERMS as string[]).includes(p)) as Perm[]) : TEACHER_DEFAULT;
  }
  // «Был в сети»: обновляем не чаще раза в 5 минут и не при входе под пользователем
  if (!row.impersonatorId && (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > 5 * 60_000)) {
    await db.update(schema.users).set({ lastSeenAt: new Date() })
      .where(and(eq(schema.users.id, row.id), or(isNull(schema.users.lastSeenAt), lt(schema.users.lastSeenAt, new Date(Date.now() - 5 * 60_000)))));
  }
  return {
    id: row.id, name: row.name, email: row.email, role: row.role, groupId: row.groupId, external: row.external,
    accessRoleId: row.accessRoleId, impersonatorId: row.impersonatorId, perms, emailVerified: row.emailVerified,
  };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;
/** Кто учится: достаточно для проверок доступа к курсам (подходит и для чужого профиля) */
export type Learner = { id: string; role: CurrentUser["role"]; groupId: string | null; external?: boolean };

/** Вошедший пользователь. Родителя без parents: true переносим в его кабинет — разделы ученика ему не нужны. */
export async function requireUser(opts: { parents?: boolean } = {}) {
  const user = await getUser();
  if (!user) redirect("/login");
  // Новая регистрация: сначала подтвердить почту кодом (если почта на сервере настроена)
  if (!user.emailVerified && !user.impersonatorId && mailEnabled()) redirect("/verify");
  if (user.role === "parent" && !opts.parents) redirect("/parent");
  return user;
}
export { isStaff, isStaffRole };
export const can = (u: { perms: readonly string[] } | null | undefined, p: Perm) => !!u?.perms.includes(p);

/** Любой персонал — вход в «Управление» */
export async function requireStaff() {
  const user = await requireUser();
  if (!isStaff(user)) redirect("/");
  return user;
}

/** Конкретное право; без него — на главную */
export async function requirePerm(p: Perm) {
  const user = await requireStaff();
  if (!can(user, p)) redirect("/");
  return user;
}

/** Только администратор: удаление демо-данных и т.п. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** Разделы для своих: внешнего ученика (клиента, партнёра) не пускаем — переносим на главную */
export async function requireInternal(opts: { parents?: boolean } = {}) {
  const user = await requireUser(opts);
  if (user.external) redirect("/");
  return user;
}
