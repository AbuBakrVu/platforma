"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { str } from "@/lib/form";
import { award } from "@/lib/gamify";
import { saveStepProgress } from "@/lib/progress";
import { parseStep } from "@/lib/steps";

/** Проверить работу: баллы по критериям, комментарий, «принять» или «на доработку» */
export async function reviewSubmission(id: string, decision: "accepted" | "returned", form: FormData) {
  const me = await requirePerm("review");
  const [row] = await db.select({ sub: t.submissions, step: t.lessonSteps, lib: t.libraryItems.content, lesson: t.lessons })
    .from(t.submissions)
    .innerJoin(t.lessonSteps, eq(t.lessonSteps.id, t.submissions.stepId))
    .innerJoin(t.lessons, eq(t.lessons.id, t.lessonSteps.lessonId))
    .leftJoin(t.libraryItems, eq(t.libraryItems.id, t.lessonSteps.libraryId))
    .where(eq(t.submissions.id, id));
  if (!row || row.sub.status !== "submitted") return;
  const a = parseStep("assignment", row.lib ?? row.step.content);
  const scores: Record<string, number> = {};
  for (const c of a.rubric) {
    const v = Number(str(form, `c_${c.id}`));
    scores[c.id] = Number.isFinite(v) ? Math.min(c.max, Math.max(0, Math.round(v))) : 0;
  }
  const max = a.rubric.reduce((n, c) => n + c.max, 0);
  const score = a.rubric.length ? Object.values(scores).reduce((n, v) => n + v, 0) : null;
  await db.update(t.submissions).set({
    status: decision, scores, score, maxScore: a.rubric.length ? max : null,
    feedback: str(form, "feedback").slice(0, 10_000), reviewerId: me.id, reviewedAt: new Date(),
  }).where(eq(t.submissions.id, id));

  if (decision === "accepted") {
    await saveStepProgress(row.sub.userId, row.step.id, true, { submissionId: id, score });
    // Награда ученику; праздник он увидит не здесь (это действие проверяющего)
    await award(row.sub.userId, { xp: a.xp, reason: `Задание в уроке «${row.lesson.title}» принято`, sourceKey: `assignment:${row.step.id}`, notify: false });
  }
  revalidatePath("/admin/review", "layout");
  // Следующая работа в очереди
  const [next] = await db.select({ id: t.submissions.id }).from(t.submissions)
    .where(and(eq(t.submissions.status, "submitted"), gt(t.submissions.submittedAt, row.sub.submittedAt)))
    .orderBy(asc(t.submissions.submittedAt)).limit(1);
  redirect(next ? `/admin/review/${next.id}?done=${decision}` : `/admin/review?done=${decision}`);
}
