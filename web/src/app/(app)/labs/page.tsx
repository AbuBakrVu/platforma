import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { labsEnabled } from "@/lib/labs";
import { getMyLabs, getXp } from "@/lib/queries";
import { parseStep } from "@/lib/steps";
import { plural } from "@/lib/format";
import { TopBar } from "@/components/TopBar";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Лаборатории" };

/** Все лабораторные из курсов студента */
export default async function LabsPage() {
  const user = await requireUser();
  const [labs, xp] = await Promise.all([getMyLabs(user), getXp(user.id)]);
  return (
    <>
      <TopBar xp={xp} left={<b>Лаборатории</b>} />
      <div className="title">
        <h1>Лаборатории</h1>
        <p>Практика в настоящем терминале: у каждого своя учебная машина, которую можно сломать и сбросить одной кнопкой.</p>
      </div>
      {!labsEnabled() && user.role !== "student" && (
        <div className="notice">Сервис лабораторий на сервере не включён — студенты увидят задания, но не смогут запустить среду. Как включить — в README, раздел «Лаборатории».</div>
      )}
      <section className="card">
        {labs.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Лабораторная</th><th>Курс</th><th>Задания</th><th /></tr></thead>
              <tbody>
                {labs.map((l) => {
                  const lab = parseStep("lab", l.content);
                  return (
                    <tr key={l.stepId}>
                      <td><b style={{ fontWeight: 600 }}>{l.title || l.lesson}</b>{l.title && <div className="small muted">{l.lesson}</div>}</td>
                      <td>{l.course}</td>
                      <td>{l.done ? <span className="tag"><Icon name="check" size={14} />Выполнена</span>
                        : `${lab.tasks.length} ${plural(lab.tasks.length, "задание", "задания", "заданий")}`}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/labs/${l.stepId}`} className={`btn sm ${l.done ? "" : "pri"}`}><Icon name="term" size={16} />Открыть</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">В ваших курсах пока нет лабораторных.</p>}
      </section>
    </>
  );
}
