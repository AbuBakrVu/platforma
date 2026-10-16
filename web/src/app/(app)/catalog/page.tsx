import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { catalog, fmtPrice } from "@/lib/catalog";
import { plural } from "@/lib/format";
import { getXp } from "@/lib/queries";
import { CourseCover } from "@/components/CourseCover";
import { TopBar } from "@/components/TopBar";
import cs from "@/components/course-card.module.css";

export const metadata = { title: "Каталог курсов" };

/** Все опубликованные курсы: бесплатные — записаться сразу, платные — после оплаты */
export default async function CatalogPage() {
  const user = await requireUser();
  const [courses, xp] = await Promise.all([catalog(user), getXp(user.id)]);
  return (
    <>
      <TopBar xp={xp} left={<b>Каталог курсов</b>} />
      <div className="title"><h1>Каталог курсов</h1><p>Выберите курс и нажмите «Записаться». Бесплатные открываются сразу, платные — после оплаты.</p></div>
      {courses.length ? (
        <div className={cs.grid}>
          {courses.map((c) => (
            <Link key={c.id} href={`/catalog/${c.slug}`} className={cs.card}>
              <CourseCover title={c.title} coverId={c.coverId} />
              <div className={cs.body}>
                <div className={cs.meta}>
                  <span className={`tag ${c.price > 0 ? "" : "grey"}`} style={{ fontWeight: 600 }}>{fmtPrice(c.price)}</span>
                  {c.enrolled ? <span className="tag">Вы записаны</span>
                    : c.request?.status === "new" ? <span className="tag warn">Заявка отправлена</span> : null}
                </div>
                <h3>{c.title}</h3>
                {c.description && <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>{c.description}</p>}
                <div className={cs.meta} style={{ marginTop: "auto" }}>{c.lessons} {plural(c.lessons, "урок", "урока", "уроков")}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : <section className="card"><p className="empty">Курсы скоро появятся.</p></section>}
    </>
  );
}
