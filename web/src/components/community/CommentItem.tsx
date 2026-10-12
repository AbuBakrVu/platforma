"use client";

import { useState } from "react";
import { addComment, deleteComment, editComment } from "@/app/(app)/community/actions";
import { Avatar, type AvatarUser } from "@/components/Avatar";
import { Composer } from "./Composer";
import { Reactions } from "./Reactions";
import s from "./community.module.css";

export type CommentView = {
  id: string; parentId: string | null; html: string; raw: string; at: string; edited: boolean; deleted: boolean;
  author: AvatarUser & { id: string; role: string }; reactions: { emoji: string; count: number; mine: boolean }[];
};

const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CommentItem({ c, lessonId, me, canModerate, replies }: {
  c: CommentView; lessonId: string; me: string; canModerate: boolean; replies?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"view" | "reply" | "edit">("view");
  return (
    <div id={`c-${c.id}`}>
      <div className={s.msg}>
        <Avatar user={c.author} size={40} />
        <div className={s.msgBody}>
          <div className={s.msgHead}>
            <b>{c.author.name}</b>
            {c.author.role !== "student" && <span className={s.staff}>{c.author.role === "admin" ? "администратор" : "преподаватель"}</span>}
            <span className="small muted">{when(c.at)}{c.edited ? " · изменено" : ""}</span>
          </div>
          {c.deleted ? <span className={s.deleted}>Комментарий удалён</span>
            : mode === "edit"
              ? <Composer initial={c.raw} submit="Сохранить" autoFocus send={(text) => editComment(c.id, text)} onDone={() => setMode("view")} />
              : <div className={s.text} dangerouslySetInnerHTML={{ __html: c.html }} />}
          {!c.deleted && mode !== "edit" && (
            <div className={s.actions}>
              <Reactions target="comment" id={c.id} initial={c.reactions} />
              <button type="button" className={s.link} onClick={() => setMode(mode === "reply" ? "view" : "reply")}>Ответить</button>
              {c.author.id === me && <button type="button" className={s.link} onClick={() => setMode("edit")}>Изменить</button>}
              {(c.author.id === me || canModerate) && (
                <button type="button" className={s.link} onClick={() => { if (window.confirm("Удалить комментарий?")) deleteComment(c.id); }}>Удалить</button>
              )}
            </div>
          )}
        </div>
      </div>
      {(replies || mode === "reply") && (
        <div className={s.replies}>
          {replies}
          {mode === "reply" && (
            <Composer autoFocus placeholder={`Ответ для ${c.author.name}`} submit="Ответить"
              initial={c.author.id === me ? "" : `@${c.author.name} `}
              send={(text) => addComment(lessonId, text, c.parentId ?? c.id)} onDone={() => setMode("view")} />
          )}
        </div>
      )}
    </div>
  );
}
