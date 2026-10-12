import { requireUser } from "@/lib/auth";
import { contacts, myChats } from "@/lib/chats";
import { getXp } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { startDirect } from "./actions";
import { ChatList } from "./ChatList";
import s from "./messages.module.css";

export const metadata = { title: "Сообщения" };

const ROLE = { student: "студент", teacher: "преподаватель", admin: "администратор" } as const;

export default async function Messages() {
  const user = await requireUser();
  const [chats, people, xp] = await Promise.all([myChats(user), contacts(user), getXp(user.id)]);
  return (
    <>
      <TopBar xp={xp} left={<b>Сообщения</b>} />
      <div className={s.layout}>
        <section className={`card ${s.side}`}>
          <form action={startDirect} className="form">
            <label htmlFor="to" className="small muted">Новый диалог</label>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <select id="to" name="user" className="ctl" required defaultValue="">
                <option value="" disabled>{user.role === "student" ? "Преподаватель или наставник" : "Кому написать"}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE[p.role]}</option>)}
              </select>
              <button className="btn pri">Написать</button>
            </div>
          </form>
          <ChatList chats={chats} />
        </section>
        <section className={`card ${s.empty}`}><p className="muted">Выберите чат слева или начните новый диалог.</p></section>
      </div>
    </>
  );
}
