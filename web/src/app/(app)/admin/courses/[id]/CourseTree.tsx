"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Confirm, Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { KIND_LABEL } from "@/lib/format";
import { addLesson, deleteSection, moveLesson, moveSection, reorderCourse, updateSection } from "../actions";
import s from "../../admin.module.css";

type Lesson = { id: string; title: string; kind: keyof typeof KIND_LABEL; steps: number };
type Section = { id: string; title: string; opensAt: string; lessons: Lesson[] };
type Drag = { type: "section" | "lesson"; id: string } | null;

/** Разделы и уроки курса: перетаскивание за ручку (в том числе урока в другой раздел) и кнопки ↑↓ для клавиатуры */
export function CourseTree({ courseId, sections: initial }: { courseId: string; sections: Section[] }) {
  const [sections, setSections] = useState(initial);
  const [prev, setPrev] = useState(initial);
  const [drag, setDrag] = useState<Drag>(null);
  const [saving, start] = useTransition();
  const dirty = useRef(false);
  const lessons = new Map(initial.flatMap((x) => x.lessons).map((l) => [l.id, l]));

  // Сервер прислал новые данные (добавили урок, переименовали) — принимаем их
  if (prev !== initial) {
    setPrev(initial);
    setSections(initial);
  }

  const moveLessonTo = (lessonId: string, secId: string, beforeId: string | null) => setSections((cur) => {
    const next = cur.map((x) => ({ ...x, lessons: x.lessons.filter((l) => l.id !== lessonId) }));
    const sec = next.find((x) => x.id === secId)!;
    const at = beforeId ? sec.lessons.findIndex((l) => l.id === beforeId) : sec.lessons.length;
    sec.lessons.splice(at < 0 ? sec.lessons.length : at, 0, lessons.get(lessonId)!);
    dirty.current = true;
    return next;
  });

  const moveSectionTo = (secId: string, beforeId: string | null) => setSections((cur) => {
    if (secId === beforeId) return cur;
    const moving = cur.find((x) => x.id === secId)!;
    const next = cur.filter((x) => x.id !== secId);
    const at = beforeId ? next.findIndex((x) => x.id === beforeId) : next.length;
    next.splice(at, 0, moving);
    dirty.current = true;
    return next;
  });

  const end = () => {
    setDrag(null);
    if (!dirty.current) return;
    dirty.current = false;
    const order = sections.map((x) => ({ id: x.id, lessons: x.lessons.map((l) => l.id) }));
    start(() => reorderCourse(courseId, order));
  };

  /** Над элементом списка: верхняя половина — вставить перед ним, нижняя — после */
  const half = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? "before" : "after";
  };

  return (
    <>
      {saving && <div className="small muted" role="status">Сохраняю порядок…</div>}
      {sections.map((sec, i) => (
        <section key={sec.id} className={`card ${drag?.id === sec.id ? s.dragging : ""}`} id={`sec-${sec.id}`}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            if (drag.type === "section") {
              const after = half(e) === "after";
              moveSectionTo(drag.id, after ? sections[i + 1]?.id ?? null : sec.id);
            } else if (sec.lessons.length === 0) {
              moveLessonTo(drag.id, sec.id, null);
            }
          }}
          onDrop={(e) => { e.preventDefault(); end(); }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <span className={s.handle} draggable title="Перетащите, чтобы поменять порядок разделов" aria-hidden
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", sec.id);
                e.dataTransfer.setDragImage(document.getElementById(`sec-${sec.id}`)!, 24, 24);
                setDrag({ type: "section", id: sec.id });
              }}
              onDragEnd={end}>
              <Icon name="drag" size={18} />
            </span>
            <form action={updateSection.bind(null, courseId, sec.id)} className="row" style={{ flex: "1 1 400px", alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 220px" }}>
                <label htmlFor={`s-${sec.id}`}>Раздел {String(i + 1).padStart(2, "0")}</label>
                <input id={`s-${sec.id}`} name="title" defaultValue={sec.title} className="ctl" style={{ fontWeight: 600 }} required />
              </div>
              <div className="field" style={{ flex: "0 1 210px" }}>
                <label htmlFor={`so-${sec.id}`}>Открывается</label>
                <input id={`so-${sec.id}`} name="opensAt" type="datetime-local" defaultValue={sec.opensAt} className="ctl" />
              </div>
              <Submit className="btn sm">Сохранить</Submit>
            </form>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <form action={moveSection.bind(null, courseId, sec.id, -1)}><button className="btn sm" aria-label="Раздел выше" disabled={i === 0}><Icon name="up" size={16} /></button></form>
              <form action={moveSection.bind(null, courseId, sec.id, 1)}><button className="btn sm" aria-label="Раздел ниже" disabled={i === sections.length - 1}><Icon name="down" size={16} /></button></form>
              <form action={deleteSection.bind(null, courseId, sec.id)}>
                <Confirm className="btn sm danger" message={`Удалить раздел «${sec.title}» со всеми уроками (${sec.lessons.length})?`}><Icon name="trash" size={16} /></Confirm>
              </form>
            </div>
          </div>

          <div className={s.list}>
            {sec.lessons.map((l, j) => (
              <div key={l.id} id={`l-${l.id}`} className={`${s.item} ${drag?.id === l.id ? s.dragging : ""}`}
                onDragOver={(e) => {
                  if (drag?.type !== "lesson" || drag.id === l.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  moveLessonTo(drag.id, sec.id, half(e) === "before" ? l.id : sec.lessons[j + 1]?.id ?? null);
                }}>
                <span className={s.handle} draggable title="Перетащите урок — можно и в другой раздел" aria-hidden
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", l.id);
                    e.dataTransfer.setDragImage(document.getElementById(`l-${l.id}`)!, 16, 16);
                    setDrag({ type: "lesson", id: l.id });
                  }}
                  onDragEnd={end}>
                  <Icon name="drag" size={16} />
                </span>
                <span className="tag grey">{KIND_LABEL[l.kind]}</span>
                <Link href={`/admin/courses/${courseId}/lessons/${l.id}`} className={s.itemTitle}>{l.title}</Link>
                <span className="small muted">{l.steps} {l.steps === 1 ? "шаг" : l.steps >= 2 && l.steps <= 4 ? "шага" : "шагов"}</span>
                <form action={moveLesson.bind(null, courseId, l.id, -1)}><button className="btn sm" aria-label="Урок выше" disabled={j === 0}><Icon name="up" size={16} /></button></form>
                <form action={moveLesson.bind(null, courseId, l.id, 1)}><button className="btn sm" aria-label="Урок ниже" disabled={j === sec.lessons.length - 1}><Icon name="down" size={16} /></button></form>
              </div>
            ))}
            {sec.lessons.length === 0 && <p className="empty small">В разделе пока нет уроков{drag?.type === "lesson" ? " — отпустите урок здесь" : ""}.</p>}
          </div>

          <form action={addLesson.bind(null, courseId, sec.id)} className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 240px" }}>
              <label htmlFor={`nl-${sec.id}`}>Новый урок</label>
              <input id={`nl-${sec.id}`} name="title" className="ctl" placeholder="Название урока" required />
            </div>
            <select name="kind" className="ctl" style={{ width: 150 }} aria-label="Тип урока" defaultValue="theory">
              <option value="theory">Теория</option><option value="practice">Практика</option><option value="lab">Лаба</option>
            </select>
            <Submit className="btn"><Icon name="plus" size={18} />Добавить</Submit>
          </form>
        </section>
      ))}
    </>
  );
}
