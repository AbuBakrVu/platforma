import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { activeSession, labsEnabled, lastTasksDone, refreshStatus } from "@/lib/labs";
import { renderMd } from "@/lib/markdown";
import { getStepForUser } from "@/lib/queries";
import { uuidOrNull } from "@/lib/form";
import { parseStep, publicLab } from "@/lib/steps";
import { db, schema as t } from "@/db";
import { eq } from "drizzle-orm";
import type { LabState } from "./actions";
import { LabRoom } from "./LabRoom";

export const metadata = { title: "Лабораторная" };

export default async function LabPage({ params }: PageProps<"/labs/[stepId]">) {
  const user = await requireUser();
  const stepId = uuidOrNull((await params).stepId);
  const row = stepId ? await getStepForUser(stepId, user) : null;
  if (!row || row.step.kind !== "lab") notFound();
  const [course] = await db.select({ slug: t.courses.slug, title: t.courses.title }).from(t.courses).where(eq(t.courses.id, row.course.id));
  const back = `/courses/${course.slug}/${row.lesson.id}`;

  if (!labsEnabled()) {
    return (
      <section className="card" style={{ maxWidth: 640, margin: "40px auto" }}>
        <h2>Лаборатории не включены</h2>
        <p className="muted">Администратору: включите сервис лабораторий (профиль <code>labs</code>, см. README) — тогда здесь появится терминал.</p>
        <Link href={back} className="btn">Вернуться к уроку</Link>
      </section>
    );
  }

  const lab = publicLab(parseStep("lab", row.step.content));
  let s = await activeSession(user.id, row.step.id);
  if (s) s = await refreshStatus(s);
  const initial: LabState = s && !s.stoppedAt
    ? { status: s.status as LabState["status"], error: s.error, expiresAt: s.expiresAt.toISOString(), tasksDone: s.tasksDone }
    : s?.status === "error"
      ? { status: "error", error: s.error, expiresAt: null, tasksDone: s.tasksDone }
      : { status: "none", error: null, expiresAt: null, tasksDone: await lastTasksDone(user.id, row.step.id) };

  return (
    <LabRoom stepId={row.step.id} back={back} xp={row.lesson.xp}
      title={row.step.title || row.lesson.title} subtitle={`${course.title} · ${row.section.title}`}
      tasks={lab.tasks.map((x) => ({ id: x.id, title: x.title, html: renderMd(x.md), hint: x.hint ? renderMd(x.hint) : "" }))}
      initial={initial} />
  );
}
