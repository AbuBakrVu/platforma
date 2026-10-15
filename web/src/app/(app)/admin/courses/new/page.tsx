import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { requirePerm } from "@/lib/auth";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createCourse } from "../actions";
import { ImportCourse } from "../ImportCourse";

export const metadata = { title: "Создать курс" };

const PLAN_EXAMPLE = `Например:

Знакомство с Docker
- Что такое контейнер
- Установка Docker
Образы
- Dockerfile
- Сборка образа`;

/** Новый курс одной формой или загрузка готового курса из архива */
export default async function NewCourse() {
  await requirePerm("courses");
  const groups = await db.select({ id: t.groups.id, name: t.groups.name }).from(t.groups).orderBy(asc(t.groups.name));

  return (
    <>
      <div className="crumbs"><Link href="/admin/courses">Курсы</Link><span>/</span><b>Создать курс</b></div>
      <div className="title"><h1>Создать курс</h1><p>Заполните название и, если хотите, план — разделы и уроки создадутся сразу.</p></div>
      <section className="card">
        <div className="card-h"><h2>Новый курс</h2></div>
        <form action={createCourse} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="c-title">Название</label>
              <input id="c-title" name="title" className="ctl" placeholder="Например, Linux. Основы" required /></div>
            <div className="field"><label htmlFor="c-desc">Короткое описание <span className="muted">(необязательно)</span></label>
              <input id="c-desc" name="description" className="ctl" /></div>
          </div>
          <div className="field">
            <span className="small muted">Какие потоки будут проходить курс</span>
            {groups.length ? (
              <div className="row" style={{ gap: 18 }}>
                {groups.map((g) => (
                  <label key={g.id} className="check"><input type="checkbox" name="group" value={g.id} />{g.name}</label>
                ))}
              </div>
            ) : <span className="small muted">Потоков пока нет — выберете потом на странице курса.</span>}
          </div>
          <div className="field"><label htmlFor="c-plan">План курса <span className="muted">(необязательно — можно добавить потом)</span></label>
            <textarea id="c-plan" name="plan" className="ctl mono" style={{ minHeight: 150 }} placeholder={PLAN_EXAMPLE} />
            <span className="small muted">Строка — раздел. Строка с чёрточкой «-» в начале — урок этого раздела. Всё создастся сразу, тексты уроков напишете потом.</span>
          </div>
          <div className="row">
            <Submit pending="Создаю…"><Icon name="plus" size={18} />Создать курс</Submit>
            <span className="small muted">Курс будет черновиком — ученики увидят его после кнопки «Опубликовать».</span>
          </div>
        </form>
      </section>
      <section className="card">
        <div className="card-h"><h2>Или загрузить готовый курс</h2></div>
        <p className="muted" style={{ margin: 0 }}>Файл <span className="mono">.platforma.zip</span>, скачанный кнопкой «Скачать курс» — на этой или другой платформе.</p>
        <div><ImportCourse /></div>
      </section>
    </>
  );
}
