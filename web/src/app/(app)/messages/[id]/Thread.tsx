"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Composer } from "@/components/community/Composer";
import { Reactions } from "@/components/community/Reactions";
import c from "@/components/community/community.module.css";
import { deleteMessage, fetchMessages, sendMessage, type MessageView } from "../actions";
import s from "../messages.module.css";

const time = (iso: string) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

/** Переписка: новые сообщения подтягиваются раз в 3 секунды */
export function Thread({ chatId, initial, canModerate }: { chatId: string; initial: MessageView[]; canModerate: boolean }) {
  const [msgs, setMsgs] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  const lastAt = useRef(initial.at(-1)?.at ?? null);
  const stick = useRef(true);

  const pull = useCallback(async () => {
    const fresh = await fetchMessages(chatId, lastAt.current);
    if (fresh?.length) {
      lastAt.current = fresh.at(-1)!.at;
      setMsgs((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
    }
  }, [chatId]);

  // Пока вкладка скрыта, не опрашиваем; вернулись — сразу подтягиваем пропущенное
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) pull(); }, 3000);
    const onShow = () => { if (!document.hidden) pull(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onShow); };
  }, [pull]);

  // Держимся внизу, если пользователь не прокрутил вверх
  useEffect(() => { if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);

  return (
    <div className={s.thread}>
      <div ref={box} className={s.scroll} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {msgs.length === 0 && <p className="empty">Сообщений пока нет — напишите первым.</p>}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const newDay = !prev || day(prev.at) !== day(m.at);
          const grouped = prev && !newDay && prev.author.id === m.author.id && new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000;
          return (
            <div key={m.id}>
              {newDay && <div className={s.day}>{day(m.at)}</div>}
              <div className={`${s.m} ${m.mine ? s.mine : ""} ${grouped ? s.grouped : ""}`}>
                {!m.mine && !grouped ? <Avatar user={m.author} size={32} /> : <span className={s.spacer} />}
                <div className={s.bubbleWrap}>
                  {!m.mine && !grouped && <span className={s.name}>{m.author.name}{m.author.role !== "student" && <span className={c.staff}> {m.author.role === "admin" ? "админ" : "преподаватель"}</span>}</span>}
                  <div className={s.bubble}>
                    {m.deleted ? <span className={c.deleted}>Сообщение удалено</span> : <div className={c.text} dangerouslySetInnerHTML={{ __html: m.html }} />}
                    <span className={s.time}>{time(m.at)}</span>
                  </div>
                  {!m.deleted && (
                    <div className={s.tools}>
                      <Reactions target="message" id={m.id} initial={m.reactions} />
                      {(m.mine || canModerate) && <button type="button" className={c.link} onClick={async () => {
                        if (!window.confirm("Удалить сообщение?")) return;
                        await deleteMessage(m.id);
                        setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, deleted: true, html: "" } : y)));
                      }}>Удалить</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Composer placeholder="Сообщение" send={async (text) => { stick.current = true; const r = await sendMessage(chatId, text); await pull(); return r; }} rows={2} />
    </div>
  );
}
