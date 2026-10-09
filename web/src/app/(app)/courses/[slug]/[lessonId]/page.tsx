import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { requireUser } from "@/lib/auth";
import { getCourseOutline, getLesson, getXp } from "@/lib/queries";
import { fmtDate, KIND_LABEL, plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Icon, type IconName } from "@/components/Icon";
import { completeLesson } from "./actions";
import s from "./lesson.module.css";

const KIND_ICON: Record<keyof typeof KIND_LABEL, IconName> = { theory: "doc", practice: "flask", lab: "term" };

export async function generateMetadata({ params }: PageProps<"/courses/[slug]/[lessonId]">) {
  const row = await getLesson((await params).lessonId).catch(() => null);
  return { title: row?.lesson.title ?? "Урок" };
}

export default async function LessonPage({ params }: PageProps<"/courses/[slug]/[lessonId]">) {
  const { slug, lessonId } = await params;
  const user = await requireUser();
  const [outline, row, xp] = await Promise.all([getCourseOutline(slug, user.id), getLesson(lessonId), getXp(user.id)]);
  if (!outline || !row || row.section.courseId !== outline.course.id) notFound();

  const i = outline.flat.findIndex((l) => l.id === lessonId);
  if (i < 0) notFound(); // раздел ещё закрыт
  const cur = outline.flat[i];
  const prev = outline.flat[i - 1];
  const next = outline.flat[i + 1];
  const pct = outline.total ? Math.round((outline.done / outline.total) * 100) : 0;
  const html = await marked.parse(row.lesson.body);

  return (
    <>
      <TopBar
        xp={xp}
        left={<>
          <Link href="/courses">Навыки</Link><span>/</span>
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
                    {sec.lessons.map((l) => (
                      <Link key={l.id} href={`/courses/${slug}/${l.id}`} className={`${s.l} ${l.id === lessonId ? s.on : ""}`}
                        aria-current={l.id === lessonId ? "page" : undefined}>
                        <Icon name={KIND_ICON[l.kind]} size={18} />
                        <span className={s.lt}>{l.title}</span>
                        {l.done && <Icon name="check" size={18} className={s.ok} />}
                      </Link>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </section>

        <article className={`card ${s.article}`}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
            <div className="row">
              <span className="tag">{KIND_LABEL[row.lesson.kind]}</span>
              <span className="small muted">~{row.lesson.durationMin} мин · +{row.lesson.xp} XP</span>
            </div>
            {cur.done && <span className="tag grey"><Icon name="check" size={14} />Пройден</span>}
          </div>
          <h1 className={s.h1}>{row.lesson.title}</h1>
          <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
          <div className={s.foot}>
            {prev ? (
              <Link href={`/courses/${slug}/${prev.id}`} className="btn"><Icon name="left" size={18} />{prev.title}</Link>
            ) : <span />}
            <div className="row">
              {row.lesson.kind === "lab" && (
                <Link href="/labs" className="btn dark"><Icon name="term" size={18} />Открыть терминал</Link>
              )}
              <form action={completeLesson.bind(null, slug, lessonId)}>
                <button className="btn pri">
                  {cur.done ? (next ? "Дальше" : "К курсам") : next ? "Пройдено, дальше" : "Завершить курс"}
                  <Icon name="right" size={18} />
                </button>
              </form>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}
