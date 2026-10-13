import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCourseMaterials, getCourseOutline, getLesson, getLessonSteps, getXp, isLive } from "@/lib/queries";
import { isRequired, STEP_LABEL, type StepKind } from "@/lib/steps";
import { fmtDate, KIND_LABEL, plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Icon, type IconName } from "@/components/Icon";
import { CompleteButton } from "./CompleteButton";
import { StepView } from "./StepView";
import { LessonComments } from "@/components/community/LessonComments";
import s from "./lesson.module.css";

const KIND_ICON: Record<keyof typeof KIND_LABEL, IconName> = { theory: "doc", practice: "flask", lab: "term" };
const STEP_ICON: Record<StepKind, IconName> = { text: "doc", video: "play", file: "doc", quiz: "exam", cards: "cards", package: "skills", lab: "term", assignment: "edit" };

export async function generateMetadata({ params }: PageProps<"/courses/[slug]/[lessonId]">) {
  const row = await getLesson((await params).lessonId).catch(() => null);
  return { title: row?.lesson.title ?? "Урок" };
}

export default async function LessonPage({ params, searchParams }: PageProps<"/courses/[slug]/[lessonId]">) {
  const { slug, lessonId } = await params;
  const user = await requireUser();
  const [outline, row, xp, steps] = await Promise.all([
    getCourseOutline(slug, user), getLesson(lessonId), getXp(user.id), getLessonSteps(lessonId, user.id),
  ]);
  const materials = outline ? await getCourseMaterials(outline.course.id) : [];
  const courseFiles = materials.filter((m) => !m.lessonId);
  const lessonFiles = materials.filter((m) => m.lessonId === lessonId);
  if (!outline || !row || row.section.courseId !== outline.course.id) notFound();

  const i = outline.flat.findIndex((l) => l.id === lessonId);
  if (i < 0) notFound(); // раздел ещё закрыт
  const cur = outline.flat[i];
  const prev = outline.flat[i - 1];
  const next = outline.flat[i + 1];
  const pct = outline.total ? Math.round((outline.done / outline.total) * 100) : 0;
  const longread = row.lesson.layout === "longread";
  const n = Math.min(Math.max(1, Number((await searchParams).step) || 1), Math.max(1, steps.length));
  const shown = longread ? steps : steps.slice(n - 1, n);
  const lastStep = longread || n >= steps.length;
  // В последовательном курсе следующий урок ещё закрыт, но он есть — считаем по всем урокам
  const ordered = outline.sections.filter((x) => !x.locked).flatMap((x) => x.lessons);
  const hasNext = !!ordered[ordered.findIndex((l) => l.id === lessonId) + 1];
  const finishLabel = cur.done ? (next ? "Следующий урок" : "К курсам") : hasNext ? "Завершить урок" : "Завершить курс";

  return (
    <>
      <TopBar
        xp={xp}
        left={<>
          <Link href="/courses">Мои курсы</Link><span>/</span>
          <Link href={`/courses/${slug}`}>{outline.course.title}</Link><span>/</span>
          <b>{row.section.title}</b>
        </>}
      />

      <div className={s.layout}>
        <section className={`card ${s.outline}`}>
          <div className={s.head}>
            <h2>{outline.course.title}</h2>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="small muted">{outline.done} из {outline.total} {plural(outline.total, "урока", "уроков", "уроков")} · {pct}%</span>
          </div>
          {outline.sections.map((sec) => {
            const done = sec.lessons.filter((l) => l.done).length;
            const all = sec.lessons.length;
            const ring = sec.locked ? null : done === all && all > 0 ? s.done : done > 0 ? s.part : s.none;
            return (
              <details key={sec.id} className={s.sec} open={sec.id === row.section.id}>
                <summary className={s.secH}>
                  <div>
                    <span className={s.n}>Раздел {String(sec.position).padStart(2, "0")}{sec.locked && sec.opensAt ? ` · откроется ${fmtDate(sec.opensAt)}` : ""}</span>
                    <b className={sec.locked ? "muted" : undefined}>{sec.title}</b>
                  </div>
                  {sec.locked ? (
                    <Icon name="lock" size={18} className={s.lock} />
                  ) : (
                    <span className={`${s.ring} ${ring}`} style={{ "--p": `${all ? (done / all) * 100 : 0}%` } as React.CSSProperties}
                      aria-label={`${done} из ${all}`}>
                      {ring === s.done && <Icon name="check" size={16} />}
                    </span>
                  )}
                </summary>
                {!sec.locked && (
                  <div className={s.ls}>
                    {sec.lessons.map((l) => l.locked ? (
                      <span key={l.id} className={`${s.l} ${s.lockedL}`} title="Откроется, когда пройдёте предыдущий урок">
                        <Icon name="lock" size={18} />
                        <span className={s.lt}>{l.title}</span>
                      </span>
                    ) : (
                      <Link key={l.id} href={`/courses/${slug}/${l.id}`} className={`${s.l} ${l.id === lessonId ? s.on : ""}`}
                        aria-current={l.id === lessonId ? "page" : undefined}>
                        <Icon name={KIND_ICON[l.kind]} size={18} />
                        <span className={s.lt}>{l.title}{l.draft && <small className="muted"> · черновик</small>}</span>
                        {l.done && <Icon name="check" size={18} className={s.ok} />}
                      </Link>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
          {courseFiles.length > 0 && (
            <div className={s.files}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>Материалы курса</b>
                {materials.length > 1 && <a href={`/api/courses/${outline.course.id}/materials`} className="small">Скачать всё</a>}
              </div>
              <FileList items={courseFiles} />
            </div>
          )}
        </section>

        <div className={s.main}>
        <article className={`card ${s.article}`}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
            <div className="row">
              <span className="tag">{KIND_LABEL[row.lesson.kind]}</span>
              <span className="small muted">~{row.lesson.durationMin} мин · +{row.lesson.xp} XP</span>
            </div>
            {cur.done && <span className="tag grey"><Icon name="check" size={14} />Пройден</span>}
          </div>
          <h1 className={s.h1}>{row.lesson.title}</h1>
          {!isLive(row.lesson) && (
            <div className="notice small" style={{ marginBottom: 16 }}>Черновик или отложенная публикация — ученики этот урок пока не видят.</div>
          )}

          {!longread && steps.length > 1 && (
            <nav className={s.steps} aria-label="Шаги урока">
              {steps.map((x, i) => (
                <Link key={x.id} href={`?step=${i + 1}`} scroll={false} title={`${i + 1}. ${x.title || STEP_LABEL[x.kind]}`}
                  className={`${s.stepDot} ${x.done ? s.stepDone : ""} ${i + 1 === n ? s.stepOn : ""}`}
                  aria-current={i + 1 === n ? "step" : undefined}
                  aria-label={`Шаг ${i + 1}: ${x.title || STEP_LABEL[x.kind]}${x.done ? ", пройден" : isRequired(x.kind, x.content) ? ", обязательный" : ""}`}>
                  <Icon name={STEP_ICON[x.kind]} size={16} />
                  {!x.done && isRequired(x.kind, x.content) && <i className={s.req} />}
                </Link>
              ))}
            </nav>
          )}

          {steps.length === 0 && <p className="empty">В уроке пока нет материалов.</p>}
          <div className={s.flow}>
            {shown.map((x) => (
              <section key={x.id} className={s.stepBody} aria-label={x.title || STEP_LABEL[x.kind]}>
                {x.title && <h2 className={s.stepTitle}>{x.title}</h2>}
                <StepView step={x} user={user} />
              </section>
            ))}
          </div>

          {lessonFiles.length > 0 && (
            <div className={s.lessonFiles}>
              <b>Материалы к уроку</b>
              <FileList items={lessonFiles} />
            </div>
          )}

          <div className={s.foot}>
            {!longread && n > 1 ? (
              <Link href={`?step=${n - 1}`} scroll={false} className="btn"><Icon name="left" size={18} />Назад</Link>
            ) : prev ? (
              <Link href={`/courses/${slug}/${prev.id}`} className="btn"><Icon name="left" size={18} />{prev.title}</Link>
            ) : <span />}
            <div className="row">
              {row.lesson.kind === "lab" && (
                <Link href="/labs" className="btn dark"><Icon name="term" size={18} />Открыть терминал</Link>
              )}
              {lastStep
                ? <CompleteButton slug={slug} lessonId={lessonId} label={finishLabel} />
                : <Link href={`?step=${n + 1}`} scroll={false} className="btn pri">Дальше<Icon name="right" size={18} /></Link>}
            </div>
          </div>
        </article>
        <LessonComments lessonId={lessonId} user={user} />
        </div>
      </div>
    </>
  );
}

/** Список файлов для скачивания */
function FileList({ items }: { items: Awaited<ReturnType<typeof getCourseMaterials>> }) {
  return (
    <ul className={s.fileList}>
      {items.map((m) => (
        <li key={m.id}>
          <a href={`/api/files/${m.uploadId}?dl=1`}>
            <Icon name="dl" size={18} />
            <span><b>{m.title}</b>{m.description && <small>{m.description}</small>}</span>
            <small className="muted">{m.size < 1048576 ? `${Math.max(1, Math.round(m.size / 1024))} КБ` : `${(m.size / 1048576).toFixed(1)} МБ`}</small>
          </a>
        </li>
      ))}
    </ul>
  );
}
