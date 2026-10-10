import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { renderMd } from "@/lib/markdown";
import { getDueCards, getXp } from "@/lib/queries";
import { plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { CardDeck } from "@/components/steps/CardDeck";

export const metadata = { title: "Повторение" };

/** Карточки, которые пора повторить (интервальное повторение) */
export default async function ReviewPage() {
  const user = await requireUser();
  const [cards, xp] = await Promise.all([getDueCards(user.id), getXp(user.id)]);
  return (
    <>
      <TopBar xp={xp} left={<b>Повторение</b>} />
      <div className="title">
        <h1>Повторение</h1>
        <p>{cards.length
          ? `${cards.length} ${plural(cards.length, "карточка ждёт", "карточки ждут", "карточек ждут")} повторения. Чем лучше помните — тем реже карточка возвращается.`
          : "Сейчас повторять нечего. Карточки из уроков вернутся сюда, когда придёт время их освежить."}</p>
      </div>
      <section className="card">
        {cards.length ? (
          <CardDeck doneText="На сегодня всё. Следующие карточки появятся здесь по расписанию."
            cards={cards.map((c) => ({
              id: c.id, stepId: c.stepId, frontHtml: renderMd(c.front), backHtml: renderMd(c.back), from: c.lessonTitle,
              state: { ease: c.ease, intervalDays: c.intervalDays, reps: c.reps },
            }))} />
        ) : (
          <p className="empty">Карточки появляются в уроках как отдельный шаг. <Link href="/courses">К курсам</Link></p>
        )}
      </section>
    </>
  );
}
