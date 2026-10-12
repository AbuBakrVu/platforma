import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { uuidOrNull } from "@/lib/form";
import { STEP_KINDS, STEP_LABEL, type StepKind } from "@/lib/steps";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { insertFromLibrary } from "../courses/actions";
import { createLibraryItem } from "./actions";

export const metadata = { title: "Библиотека" };

/** Библиотека шагов: один материал — в нескольких уроках и курсах */
export default async function Library({ searchParams }: PageProps<"/admin/library">) {
  await requirePerm("courses");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const kind = STEP_KINDS.includes(sp.kind as StepKind) ? (sp.kind as StepKind) : null;
  // Режим выбора: пришли из урока по кнопке «Из библиотеки»
  const courseId = uuidOrNull(String(sp.course ?? "")), lessonId = uuidOrNull(String(sp.lesson ?? ""));
  const picking = !!(courseId && lessonId);
  const [lesson] = picking ? await db.select({ title: t.lessons.title }).from(t.lessons).where(eq(t.lessons.id, lessonId!)) : [];

  const where: SQL[] = [];
  if (q) where.push(or(ilike(t.libraryItems.title, `%${q}%`), ilike(t.libraryItems.tags, `%${q}%`))!);
  if (kind) where.push(eq(t.libraryItems.kind, kind));
  const items = await db.select({
    id: t.libraryItems.id, kind: t.libraryItems.kind, title: t.libraryItems.title, tags: t.libraryItems.tags, updatedAt: t.libraryItems.updatedAt,
    used: sql<number>`(select count(*) from lesson_steps st where st.library_id = ${t.libraryItems}.id)::int`,
  }).from(t.libraryItems).where(where.length ? and(...where) : undefined).orderBy(desc(t.libraryItems.updatedAt)).limit(200);

  return (
    <>
      <div className="title">
        <h1>Библиотека</h1>
        <p>Общие шаги для нескольких уроков и курсов: правка в библиотеке сразу появляется везде, где шаг стоит связанно.</p>
      </div>
      {picking && (
        <div className="notice" role="status">
          Выберите, что вставить в урок «{lesson?.title}». <b>Связанно</b> — правки библиотеки будут приходить в урок,
          <b> копией</b> — урок получит независимую копию. <Link href={`/admin/courses/${courseId}/lessons/${lessonId}`}>Вернуться к уроку</Link>
        </div>
      )}

      <section className="card">
        <form className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="lq">Поиск по названию и меткам</label>
            <input id="lq" name="q" defaultValue={q} className="ctl" placeholder="Например, безопасность" />
          </div>
          <select name="kind" defaultValue={kind ?? ""} className="ctl" style={{ width: 180 }} aria-label="Тип">
            <option value="">Все типы</option>
            {STEP_KINDS.map((k) => <option key={k} value={k}>{STEP_LABEL[k]}</option>)}
          </select>
          {picking && <><input type="hidden" name="course" value={courseId!} /><input type="hidden" name="lesson" value={lessonId!} /></>}
          <button className="btn">Найти</button>
        </form>

        {items.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Элемент</th><th>Тип</th><th>Используется</th><th>Изменён</th><th /></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td><Link href={`/admin/library/${it.id}`} style={{ fontWeight: 600, color: "var(--ink)" }}>{it.title}</Link>
                      {it.tags && <div className="small muted">{it.tags}</div>}</td>
                    <td><span className="tag grey">{STEP_LABEL[it.kind]}</span></td>
                    <td>{it.used ? `в ${it.used} ${it.used === 1 ? "уроке" : "уроках"}` : <span className="muted">нигде</span>}</td>
                    <td className="small muted">{fmtDateTime(it.updatedAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      {picking ? (
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <form action={insertFromLibrary.bind(null, courseId!, lessonId!, it.id, "link")}><Submit className="btn sm pri">Связанно</Submit></form>
                          <form action={insertFromLibrary.bind(null, courseId!, lessonId!, it.id, "copy")}><Submit className="btn sm">Копией</Submit></form>
                        </div>
                      ) : <Link href={`/admin/library/${it.id}`} className="btn sm"><Icon name="edit" size={16} />Открыть</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">{q || kind ? "Ничего не нашлось." : "Библиотека пуста. Сохраните шаг из урока кнопкой «Сохранить в библиотеку» или создайте элемент ниже."}</p>}
      </section>

      {!picking && (
        <section className="card">
          <form action={createLibraryItem} className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 260px" }}>
              <label htmlFor="ln">Новый элемент</label>
              <input id="ln" name="title" className="ctl" placeholder="Например, Правила техники безопасности" required />
            </div>
            <select name="kind" className="ctl" style={{ width: 180 }} aria-label="Тип" defaultValue="text">
              {STEP_KINDS.map((k) => <option key={k} value={k}>{STEP_LABEL[k]}</option>)}
            </select>
            <Submit><Icon name="plus" size={18} />Создать</Submit>
          </form>
        </section>
      )}
    </>
  );
}
