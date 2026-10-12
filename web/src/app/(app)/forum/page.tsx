import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, plural } from "@/lib/format";
import { getXp } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { forumSections } from "./sections";
import s from "./forum.module.css";

export const metadata = { title: "Форум" };

export default async function Forum() {
  const user = await requireUser();
  const [sections, xp] = await Promise.all([forumSections(user), getXp(user.id)]);
  return (
    <>
      <TopBar xp={xp} left={<b>Форум</b>} />
      <div className="title"><h1>Форум</h1><p>Обсуждения и вопросы по курсам. За лучший ответ на вопрос — +15 XP.</p></div>
      <section className="card">
        {sections.map((sec) => (
          <Link key={sec.key} href={`/forum/${sec.key}`} className={s.section}>
            <span className={s.secIcon} aria-hidden>{sec.courseId ? "📘" : "💬"}</span>
            <div className={s.secBody}><b>{sec.title}</b><span className="small muted">{sec.description}</span></div>
            <div className={s.secStats}>
              <span>{sec.topics} {plural(sec.topics, "тема", "темы", "тем")}</span>
              {sec.open > 0 && <span className="tag warn">{sec.open} без ответа</span>}
              {sec.last && <span className="small muted">{fmtDateTime(sec.last)}</span>}
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
