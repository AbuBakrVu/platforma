"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { impersonate, requirePerm } from "@/lib/auth";
import { dateTime, str, uuidOrNull } from "@/lib/form";
import { newInviteCode } from "@/lib/invites";

const touch = (id: string) => { revalidatePath(`/admin/people/${id}`); revalidatePath("/admin/users"); };
const audit = (actorId: string, targetId: string, action: string) => db.insert(t.auditLog).values({ actorId, targetId, action });

/** Смотреть платформу глазами пользователя (не администратора и не себя) */
export async function startImpersonation(id: string) {
  const me = await requirePerm("impersonate");
  const [u] = await db.select({ id: t.users.id, role: t.users.role }).from(t.users).where(eq(t.users.id, id));
  if (!u || u.id === me.id || u.role === "admin" || me.impersonatorId) return;
  if (await impersonate(me.id, u.id)) redirect(u.role === "parent" ? "/parent" : "/");
}

/** Роль доступа для персонала */
export async function setAccessRole(id: string, form: FormData) {
  const me = await requirePerm("people");
  const roleId = uuidOrNull(str(form, "accessRoleId"));
  await db.update(t.users).set({ accessRoleId: roleId }).where(and(eq(t.users.id, id), eq(t.users.role, "teacher")));
  await audit(me.id, id, roleId ? "Сменил роль доступа" : "Вернул права преподавателя по умолчанию");
  touch(id);
}

export async function setExternal(id: string, external: boolean) {
  const me = await requirePerm("people");
  await db.update(t.users).set({ external, ...(external ? { groupId: null } : {}) }).where(and(eq(t.users.id, id), eq(t.users.role, "student")));
  await audit(me.id, id, external ? "Сделал внешним учеником" : "Сделал обычным учеником");
  touch(id);
}

/** Выдать курс лично (внешнему ученику или в дополнение к потоку), с необязательным сроком */
export async function grantCourse(id: string, form: FormData) {
  const me = await requirePerm("people");
  const courseId = uuidOrNull(str(form, "courseId"));
  if (!courseId) return;
  const until = dateTime(form, "until");
  await db.insert(t.userCourses).values({ userId: id, courseId, until })
    .onConflictDoUpdate({ target: [t.userCourses.userId, t.userCourses.courseId], set: { until } });
  await audit(me.id, id, "Выдал доступ к курсу");
  touch(id);
}

export async function revokeCourse(id: string, courseId: string) {
  const me = await requirePerm("people");
  await db.delete(t.userCourses).where(and(eq(t.userCourses.userId, id), eq(t.userCourses.courseId, courseId)));
  await audit(me.id, id, "Забрал доступ к курсу");
  touch(id);
}

/** Привязать родителя к ученику (существующего пользователя с ролью «Родитель») */
export async function linkParent(childId: string, form: FormData) {
  const me = await requirePerm("people");
  const parentId = uuidOrNull(str(form, "parentId"));
  if (!parentId) return;
  const [p] = await db.select({ role: t.users.role }).from(t.users).where(eq(t.users.id, parentId));
  if (p?.role !== "parent") return;
  await db.insert(t.parentChildren).values({ parentId, childId }).onConflictDoNothing();
  await audit(me.id, childId, "Привязал родителя");
  touch(childId); touch(parentId);
}

/** Со страницы родителя: привязать ребёнка */
export async function linkChild(parentId: string, form: FormData) {
  const fd = new FormData();
  fd.set("parentId", parentId);
  const child = uuidOrNull(str(form, "childId"));
  if (child) await linkParent(child, fd);
}

export async function unlinkParent(parentId: string, childId: string) {
  const me = await requirePerm("people");
  await db.delete(t.parentChildren).where(and(eq(t.parentChildren.parentId, parentId), eq(t.parentChildren.childId, childId)));
  await audit(me.id, childId, "Отвязал родителя");
  touch(childId); touch(parentId);
}

/** Приглашение родителя: после регистрации он сразу видит этого ученика */
export async function inviteParent(childId: string) {
  const me = await requirePerm("people");
  await db.insert(t.invites).values({
    code: newInviteCode(), role: "parent", childId, maxUses: 2, expiresAt: new Date(Date.now() + 30 * 864e5),
    note: "Приглашение для родителя", createdBy: me.id,
  });
  await audit(me.id, childId, "Создал приглашение для родителя");
  touch(childId);
}
