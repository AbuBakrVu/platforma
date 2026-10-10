"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { dateTime, optStr, str, uuidOrNull } from "@/lib/form";

const KINDS = ["lecture", "practice", "deadline"] as const;

export async function createEvent(form: FormData) {
  await requireStaff();
  const groupId = uuidOrNull(str(form, "groupId"));
  const startsAt = dateTime(form, "startsAt");
  const title = str(form, "title");
  const kind = KINDS.find((k) => k === str(form, "kind")) ?? "practice";
  if (!groupId || !startsAt || !title) redirect(`/admin/schedule?group=${groupId ?? ""}&err=1`);
  const endsAt = kind === "deadline" ? null : dateTime(form, "endsAt");
  const url = optStr(form, "meetingUrl");
  await db.insert(t.scheduleEvents).values({
    groupId, kind, title, startsAt,
    endsAt: endsAt && endsAt > startsAt ? endsAt : null,
    courseId: uuidOrNull(str(form, "courseId")),
    location: optStr(form, "location"),
    meetingUrl: url && /^https?:\/\//i.test(url) ? url : null,
  });
  revalidatePath("/", "layout");
  redirect(`/admin/schedule?group=${groupId}`);
}

export async function deleteEvent(id: string, groupId: string) {
  await requireStaff();
  await db.delete(t.scheduleEvents).where(eq(t.scheduleEvents.id, id));
  revalidatePath("/", "layout");
  redirect(`/admin/schedule?group=${groupId}`);
}

const STATUSES = ["present", "absent", "excused"] as const;

/** Посещаемость: поля a_<userId> = present|absent|excused, пустое — не отмечен */
export async function saveAttendance(eventId: string, form: FormData) {
  await requireStaff();
  const [ev] = await db.select().from(t.scheduleEvents).where(eq(t.scheduleEvents.id, eventId));
  if (!ev) return;
  const students = await db.select({ id: t.users.id }).from(t.users)
    .where(and(eq(t.users.groupId, ev.groupId), eq(t.users.role, "student")));
  const rows = students.flatMap((u) => {
    const v = str(form, `a_${u.id}`);
    const status = STATUSES.find((x) => x === v);
    return status ? [{ eventId, userId: u.id, status }] : [];
  });
  await db.transaction(async (tx) => {
    if (students.length) {
      await tx.delete(t.attendance).where(and(eq(t.attendance.eventId, eventId), inArray(t.attendance.userId, students.map((u) => u.id))));
    }
    if (rows.length) await tx.insert(t.attendance).values(rows);
  });
  revalidatePath("/", "layout");
  redirect(`/admin/schedule/${eventId}?saved=1`);
}
