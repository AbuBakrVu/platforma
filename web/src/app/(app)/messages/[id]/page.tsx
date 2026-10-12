import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { myChats, openChat } from "@/lib/chats";
import { uuidOrNull } from "@/lib/form";
import { getXp } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { fetchMessages } from "../actions";
import { ChatList } from "../ChatList";
import { Thread } from "./Thread";
import s from "../messages.module.css";

export const metadata = { title: "Сообщения" };

export default async function ChatPage({ params }: PageProps<"/messages/[id]">) {
  const user = await requireUser({ parents: true });
  const id = uuidOrNull((await params).id);
  const chat = id ? await openChat(user, id) : null;
  if (!chat) notFound();
  const initial = (await fetchMessages(chat.id, null)) ?? [];
  const [chats, xp] = await Promise.all([myChats(user), getXp(user.id)]);
  const me = chats.find((c) => c.id === chat.id);
  return (
    <>
      <TopBar xp={xp} left={<><Link href="/messages">Сообщения</Link><span>/</span><b>{me?.title}</b></>} />
      <div className={s.layout}>
        <section className={`card ${s.side} ${s.hideMobile}`}><ChatList chats={chats} current={chat.id} /></section>
        <section className={`card ${s.main}`}>
          <div className="card-h"><h2>{me?.title}</h2>{chat.kind === "group" && <span className="small muted">общий чат потока</span>}</div>
          <Thread chatId={chat.id} initial={initial} canModerate={can(user, "moderate")} />
        </section>
      </div>
    </>
  );
}
