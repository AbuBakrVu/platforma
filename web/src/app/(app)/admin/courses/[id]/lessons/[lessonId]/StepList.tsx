"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { STEP_LABEL, type StepKind } from "@/lib/steps";
import { reorderSteps } from "../../../actions";
import s from "./steps.module.css";

type Item = { id: string; kind: StepKind; title: string };

/** Шаги урока слева от редактора; порядок меняется перетаскиванием */
export function StepList({ courseId, lessonId, steps: initial, current }: { courseId: string; lessonId: string; steps: Item[]; current: string | null }) {
  const [steps, setSteps] = useState(initial);
  const [prev, setPrev] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [, start] = useTransition();
  const dirty = useRef(false);
  if (prev !== initial) { setPrev(initial); setSteps(initial); }

  const end = () => {
    setDrag(null);
    if (!dirty.current) return;
    dirty.current = false;
    start(() => reorderSteps(courseId, lessonId, steps.map((x) => x.id)));
  };

  return (
    <ol className={s.steps}>
      {steps.map((st, i) => (
        <li key={st.id} id={`st-${st.id}`} className={`${s.step} ${st.id === current ? s.on : ""} ${drag === st.id ? s.dragging : ""}`}
          onDragOver={(e) => {
            if (!drag || drag === st.id) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const before = e.clientY < r.top + r.height / 2;
            setSteps((cur) => {
              const moving = cur.find((x) => x.id === drag)!;
              const next = cur.filter((x) => x.id !== drag);
              const at = next.findIndex((x) => x.id === st.id) + (before ? 0 : 1);
              next.splice(at, 0, moving);
              dirty.current = true;
              return next;
            });
          }}
          onDrop={(e) => { e.preventDefault(); end(); }}>
          <span className={s.handle} draggable aria-hidden title="Перетащите, чтобы поменять порядок"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", st.id);
              e.dataTransfer.setDragImage(document.getElementById(`st-${st.id}`)!, 16, 16);
              setDrag(st.id);
            }}
            onDragEnd={end}><Icon name="drag" size={16} /></span>
          <Link href={`?step=${st.id}`} className={s.stepLink} aria-current={st.id === current ? "true" : undefined} scroll={false}
            aria-label={`Шаг ${i + 1}: ${st.title || STEP_LABEL[st.kind]}`}>
            <span className={s.num}>{i + 1}</span>
            <span className={s.stepText}>
              <b>{st.title || STEP_LABEL[st.kind]}</b>
              {st.title && <small>{STEP_LABEL[st.kind]}</small>}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
