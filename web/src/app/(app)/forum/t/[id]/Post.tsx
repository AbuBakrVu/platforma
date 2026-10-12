"use client";

import { useState, useTransition } from "react";
import { Avatar, type AvatarUser } from "@/components/Avatar";
import { Composer } from "@/components/community/Composer";
import { Reactions } from "@/components/community/Reactions";
import c from "@/components/community/community.module.css";
import { acceptAnswer, deletePost, editPost, editTopicBody, replyTopic, votePost } from "../../actions";
import s from "../../forum.module.css";

type Summary = { emoji: string; count: number; mine: boolean }[];
export type PostView = {
  id: string; html: string; raw: string; at: string; edited: boolean; score: number; myVote: number;
  author: AvatarUser & { id: string; role: string }; reactions: Summary;
};

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Ответ в теме; для вопросов — голосование и «принять ответ» */
export function Post({ p, topicId, me, question, accepted, canAccept, canModerate, isTopic }: {
  p: PostView; topicId: string; me: string; question: boolean; accepted: boolean; canAccept: boolean; canModerate: boolean; isTopic?: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [, start] = useTransition();
  return (
    <div className={`${s.answer} ${accepted ? s.accepted : ""}`} id={`p-${p.id}`}>
      {question && !isTopic ? (
        <div className={s.votes}>
          <button type="button" aria-label="Полезный ответ" aria-pressed={p.myVote === 1} disabled={p.author.id === me}
            style={p.myVote === 1 ? { color: "var(--green)", borderColor: "var(--green)" } : undefined} onClick={() => start(() => votePost(p.id, 1))}>▲</button>
          <b>{p.score}</b>
          <button type="button" aria-label="Бесполезный ответ" aria-pressed={p.myVote === -1} disabled={p.author.id === me}
            style={p.myVote === -1 ? { color: "#B42318", borderColor: "#B42318" } : undefined} onClick={() => start(() => votePost(p.id, -1))}>▼</button>
        </div>
      ) : <Avatar user={p.author} size={40} />}
      <div className={c.msgBody}>
        <div className={c.msgHead}>
          {question && !isTopic && <Avatar user={p.author} size={24} />}
          <b>{p.author.name}</b>
          {p.author.role !== "student" && <span className={c.staff}>{p.author.role === "admin" ? "администратор" : "преподаватель"}</span>}
          <span className="small muted">{when(p.at)}{p.edited ? " · изменено" : ""}</span>
          {accepted && <span className={s.acceptedMark}>✓ Лучший ответ</span>}
        </div>
        {edit
          ? <Composer initial={p.raw} submit="Сохранить" autoFocus send={(text) => (isTopic ? editTopicBody(topicId, text) : editPost(p.id, text))} onDone={() => setEdit(false)} />
          : <div className={c.text} dangerouslySetInnerHTML={{ __html: p.html }} />}
        {!edit && (
          <div className={c.actions}>
            <Reactions target={isTopic ? "topic" : "post"} id={isTopic ? topicId : p.id} initial={p.reactions} />
            {question && !isTopic && canAccept && (
              <button type="button" className={c.link} onClick={() => start(() => acceptAnswer(topicId, accepted ? null : p.id))}>
                {accepted ? "Снять отметку" : "✓ Это лучший ответ"}</button>
            )}
            {p.author.id === me && <button type="button" className={c.link} onClick={() => setEdit(true)}>Изменить</button>}
            {!isTopic && (p.author.id === me || canModerate) && (
              <button type="button" className={c.link} onClick={() => { if (window.confirm("Удалить сообщение?")) start(() => deletePost(p.id)); }}>Удалить</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Reply({ topicId, question }: { topicId: string; question: boolean }) {
  return <Composer placeholder={question ? "Ваш ответ" : "Ваше сообщение"} submit={question ? "Ответить" : "Отправить"} send={(text) => replyTopic(topicId, text)} rows={5} />;
}
