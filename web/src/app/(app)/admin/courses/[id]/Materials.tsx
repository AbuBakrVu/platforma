"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { fmtSize, upload } from "@/lib/upload-client";
import { addMaterials, deleteMaterial, moveMaterial, updateMaterial } from "../actions";
import s from "../../admin.module.css";

type Item = { id: string; title: string; description: string; lessonId: string | null; uploadId: string; name: string; size: number };
type LessonOpt = { id: string; label: string };

/** Материалы для скачивания: чек-листы, шпаргалки, исходники — к курсу или к конкретному уроку */
export function Materials({ courseId, items, lessons }: { courseId: string; items: Item[]; lessons: LessonOpt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();

  const add = async (files: FileList) => {
    setErr(null);
    const done: { uploadId: string; title: string }[] = [];
    for (const [i, f] of Array.from(files).entries()) {
      try {
        const up = await upload(f, courseId, { onProgress: (p) => setBusy(`Загружаю ${i + 1} из ${files.length}: ${f.name} — ${p}%`) });
        done.push({ uploadId: up.id, title: f.name.replace(/\.[^.]+$/, "") });
      } catch (e) {
        setErr(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(null);
    if (done.length) start(async () => { await addMaterials(courseId, done); router.refresh(); });
  };

  return (
    <section className="card">
      <div className="card-h">
        <h2>Материалы для скачивания</h2>
        <label className={`btn sm ${busy ? s.dragging : ""}`}>
          <Icon name="plus" size={16} />Загрузить файлы
          <input type="file" multiple hidden disabled={!!busy} onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Чек-листы, шпаргалки, исходники. Материалы курса ученик видит рядом с программой курса, материалы урока — под уроком.
        Можно скачать всё одним архивом.
      </p>
      {busy && <span className="small muted" role="status">{busy}</span>}
      {err && <span className="err" role="alert">{err}</span>}
      <div className={s.list}>
        {items.map((m, i) => (
          <form key={m.id} action={updateMaterial.bind(null, courseId, m.id)} className={s.material}>
            <Icon name="doc" size={20} />
            <div className={s.materialBody}>
              <div className="row">
                <input name="title" defaultValue={m.title} className="ctl" style={{ flex: "1 1 200px" }} aria-label="Название" required />
                <select name="lessonId" defaultValue={m.lessonId ?? ""} className="ctl" style={{ flex: "1 1 200px" }} aria-label="Куда прикрепить">
                  <option value="">Ко всему курсу</option>
                  {lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
              <input name="description" defaultValue={m.description} className="ctl" placeholder="Пояснение (необязательно)" aria-label="Пояснение" />
              <span className="small muted">
                <a href={`/api/files/${m.uploadId}?dl=1`}>{m.name}</a> · {fmtSize(m.size)}
              </span>
            </div>
            <div className="row" style={{ flexWrap: "nowrap", alignSelf: "flex-start" }}>
              <Submit className="btn sm">Сохранить</Submit>
              <button type="button" className="btn sm" aria-label="Выше" disabled={i === 0}
                onClick={() => start(async () => { await moveMaterial(courseId, m.id, -1); router.refresh(); })}><Icon name="up" size={16} /></button>
              <button type="button" className="btn sm" aria-label="Ниже" disabled={i === items.length - 1}
                onClick={() => start(async () => { await moveMaterial(courseId, m.id, 1); router.refresh(); })}><Icon name="down" size={16} /></button>
              <Confirm className="btn sm danger" message={`Удалить материал «${m.title}»?`} formAction={deleteMaterial.bind(null, courseId, m.id)}>
                <Icon name="trash" size={16} />
              </Confirm>
            </div>
          </form>
        ))}
        {items.length === 0 && <p className="empty small">Материалов пока нет.</p>}
      </div>
    </section>
  );
}
