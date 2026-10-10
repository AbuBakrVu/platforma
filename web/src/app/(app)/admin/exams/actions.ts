"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requireStaff } from "@/lib/auth";
import { parseOptions, validateQuestion, type QKind } from "@/lib/exams";
import { bool, int, str, uuidOrNull } from "@/lib/form";

const asKind = (v: string): QKind => (v === "multiple" || v === "order" ? v : "single");

const touch = (id: string) => {
  revalidatePath(`/admin/exams/${id}`);
  revalidatePath("/admin/exams");
  revalidatePath("/exams");
};

function examFields(form: FormData) {
  return {
    title: str(form, "title"),
    description: str(form, "description"),
    courseId: uuidOrNull(str(form, "courseId")),
    durationMin: int(form, "durationMin", 1, 600, 45),
    passPercent: int(form, "passPercent", 1, 100, 80),
    xp: int(form, "xp", 0, 10000, 200),
  };
}

export async function createExam(form: FormData) {
  await requireStaff();
  const f = examFields(form);
  if (!f.title) return;
  const [e] = await db.insert(t.exams).values({ ...f, published: false }).returning({ id: t.exams.id });
  redirect(`/admin/exams/${e.id}`);
}

export async function updateExam(id: string, form: FormData) {
  await requireStaff();
  const f = examFields(form);
  if (!f.title) return;
  await db.update(t.exams).set({ ...f, published: bool(form, "published") }).where(eq(t.exams.id, id));
  touch(id);
}

export async function deleteExam(id: string) {
  await requireStaff();
  await db.delete(t.exams).where(eq(t.exams.id, id));
  revalidatePath("/exams");
  redirect("/admin/exams");
}

export type QuestionState = { error?: string; values?: { kind: string; prompt: string; options: string } };

export async function saveQuestion(examId: string, questionId: string | null, _: QuestionState, form: FormData): Promise<QuestionState> {
  await requireStaff();
  const kind = asKind(str(form, "kind"));
  const prompt = str(form, "prompt");
  const raw = String(form.get("options") ?? "");
  const { options, answer } = parseOptions(raw, kind);
  const error = !prompt ? "Введите текст вопроса" : validateQuestion(kind, options, answer);
  if (error) return { error, values: { kind, prompt, options: raw } };

  if (questionId) {
    await db.update(t.examQuestions).set({ kind, prompt, options, answer })
      .where(and(eq(t.examQuestions.id, questionId), eq(t.examQuestions.examId, examId)));
  } else {
    const [m] = await db.select({ p: sql<number>`coalesce(max(${t.examQuestions.position}), 0)::int` })
      .from(t.examQuestions).where(eq(t.examQuestions.examId, examId));
    await db.insert(t.examQuestions).values({ examId, kind, prompt, options, answer, position: m.p + 1 });
  }
  touch(examId);
  redirect(`/admin/exams/${examId}?saved=1#${questionId ?? "new"}`);
}

export async function deleteQuestion(examId: string, id: string) {
  await requireStaff();
  await db.delete(t.examQuestions).where(and(eq(t.examQuestions.id, id), eq(t.examQuestions.examId, examId)));
  touch(examId);
}

export async function moveQuestion(examId: string, id: string, dir: -1 | 1) {
  await requireStaff();
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(t.examQuestions).where(and(eq(t.examQuestions.id, id), eq(t.examQuestions.examId, examId)));
    if (!cur) return;
    const [nb] = await tx.select().from(t.examQuestions)
      .where(and(eq(t.examQuestions.examId, examId), dir < 0 ? lt(t.examQuestions.position, cur.position) : gt(t.examQuestions.position, cur.position)))
      .orderBy(dir < 0 ? desc(t.examQuestions.position) : asc(t.examQuestions.position)).limit(1);
    if (!nb) return;
    await tx.update(t.examQuestions).set({ position: nb.position }).where(eq(t.examQuestions.id, cur.id));
    await tx.update(t.examQuestions).set({ position: cur.position }).where(eq(t.examQuestions.id, nb.id));
  });
  touch(examId);
}
