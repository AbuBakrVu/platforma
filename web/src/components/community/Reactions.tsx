"use client";

import { useState, useTransition } from "react";
import { toggleReaction } from "@/app/(app)/community/actions";
import s from "./community.module.css";

const EMOJI = ["👍", "❤️", "🔥", "🎉", "😂", "🤔"];
type Summary = { emoji: string; count: number; mine: boolean }[];
type Target = "comment" | "post" | "topic" | "message" | "announcement";

/** Реакции-эмодзи под сообщением: клик по своей — снять, «+» — выбрать */
export function Reactions({ target, id, initial }: { target: Target; id: string; initial: Summary }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const toggle = (emoji: string) => {
    setOpen(false);
    // Сразу показываем результат, потом сверяемся с сервером
    setList((cur) => {
      const ex = cur.find((r) => r.emoji === emoji);
      if (!ex) return [...cur, { emoji, count: 1, mine: true }];
      return cur.map((r) => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r)).filter((r) => r.count > 0);
    });
    start(async () => { const r = await toggleReaction(target, id, emoji); if (r) setList(r); });
  };
  return (
    <div className={s.reactions}>
      {list.map((r) => (
        <button key={r.emoji} type="button" className={`${s.react} ${r.mine ? s.mine : ""}`} onClick={() => toggle(r.emoji)}
          aria-pressed={r.mine} aria-label={`${r.emoji} ${r.count}`}>{r.emoji} {r.count}</button>
      ))}
      <span className={s.pickWrap}>
        <button type="button" className={s.add} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Добавить реакцию">☺+</button>
        {open && (
          <span className={s.picker} role="menu">
            {EMOJI.map((e) => <button key={e} type="button" role="menuitem" onClick={() => toggle(e)}>{e}</button>)}
          </span>
        )}
      </span>
    </div>
  );
}
