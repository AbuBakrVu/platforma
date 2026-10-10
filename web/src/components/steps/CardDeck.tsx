"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewCard } from "@/app/(app)/courses/[slug]/[lessonId]/actions";
import { nextLabel, type CardState, type Grade } from "@/lib/srs";
import s from "./steps.module.css";

export type DeckCard = { id: string; stepId: string; frontHtml: string; backHtml: string; state: CardState | null; from?: string };

const GRADES: { g: Grade; label: string; cls: string }[] = [
  { g: 0, label: "Не помню", cls: "again" }, { g: 1, label: "Трудно", cls: "hard" },
  { g: 2, label: "Помню", cls: "good" }, { g: 3, label: "Легко", cls: "easy" },
];
const NEW: CardState = { ease: 250, intervalDays: 0, reps: 0 };

/** Колода карточек: переворот, самооценка, интервальное повторение. «Не помню» — карточка вернётся в конце колоды. */
export function CardDeck({ cards, title, doneText = "Колода пройдена. Карточки вернутся на повторение, когда начнёте их забывать." }: {
  cards: DeckCard[]; title?: string; doneText?: string;
}) {
  const [queue, setQueue] = useState(cards);
  const [flipped, setFlipped] = useState(false);
  const [count, setCount] = useState(0);
  const [, start] = useTransition();
  const card = queue[0];

  const rate = (g: Grade) => {
    if (!card) return;
    start(() => reviewCard(card.stepId, card.id, g));
    setFlipped(false);
    setCount((n) => n + 1);
    setQueue((q) => (g === 0 ? [...q.slice(1), { ...q[0], state: NEW }] : q.slice(1)));
  };

  if (!cards.length) return <p className="empty">Карточек пока нет.</p>;
  if (!card) {
    return (
      <div className={s.deckDone} role="status">
        <b>Готово: {count} {count === 1 ? "ответ" : count < 5 ? "ответа" : "ответов"}</b>
        <span className="muted small">{doneText}</span>
        <div className="row">
          <button type="button" className="btn sm" onClick={() => { setQueue(cards); setCount(0); }}>Пройти ещё раз</button>
          <Link href="/review" className="btn sm">Все карточки на повторение</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={s.deck}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small muted">{title ?? card.from}</span>
        <span className="small muted">Осталось: {queue.length}</span>
      </div>
      <button type="button" className={`${s.flash} ${flipped ? s.flipped : ""}`} onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Показать вопрос" : "Показать ответ"}
        onKeyDown={(e) => { if (flipped && ["1", "2", "3", "4"].includes(e.key)) rate((Number(e.key) - 1) as Grade); }}>
        <span className={s.face}>
          <span className={s.side}>{flipped ? "Ответ" : "Вопрос"}</span>
          <span className="prose" dangerouslySetInnerHTML={{ __html: flipped ? card.backHtml : card.frontHtml }} />
          {!flipped && <span className="small muted">Нажмите, чтобы перевернуть</span>}
        </span>
      </button>
      {flipped ? (
        <div className={s.grades}>
          {GRADES.map(({ g, label, cls }) => (
            <button key={g} type="button" className={`btn sm ${s[cls]}`} onClick={() => rate(g)}>
              <span>{label}</span><small>{nextLabel(card.state ?? NEW, g)}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className={s.grades}><button type="button" className="btn pri sm" onClick={() => setFlipped(true)}>Показать ответ</button></div>
      )}
    </div>
  );
}
