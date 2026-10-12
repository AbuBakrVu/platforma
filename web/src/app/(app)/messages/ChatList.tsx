import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { myChats } from "@/lib/chats";
import s from "./messages.module.css";

/** Левая колонка: чаты с последним сообщением и непрочитанными */
export function ChatList({ chats, current }: { chats: Awaited<ReturnType<typeof myChats>>; current?: string }) {
  return (
    <nav className={s.list} aria-label="Чаты">
      {chats.map((c) => (
        <Link key={c.id} href={`/messages/${c.id}`} className={`${s.item} ${c.id === current ? s.on : ""}`} aria-current={c.id === current ? "page" : undefined}>
          {c.other ? <Avatar user={c.other} size={40} /> : <span className={s.groupIcon} aria-hidden>👥</span>}
          <span className={s.itemBody}>
            <b>{c.title}</b>
            <small>{c.last ? c.last.body.slice(0, 60) : "нет сообщений"}</small>
          </span>
          {c.unread > 0 && <span className="badge">{c.unread}</span>}
        </Link>
      ))}
      {chats.length === 0 && <p className="empty small">Чатов пока нет.</p>}
    </nav>
  );
}
