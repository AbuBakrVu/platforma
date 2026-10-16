import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { catalogCourse, fmtPrice } from "@/lib/catalog";
import { fmtDate, plural } from "@/lib/format";
import { renderMd } from "@/lib/markdown";
import { isStaff } from "@/lib/permissions";
import { getXp } from "@/lib/queries";
import { getSetting } from "@/lib/settings";
import { Confirm, Submit } from "@/components/Buttons";
import { CourseCover } from "@/components/CourseCover";
import { Icon } from "@/components/Icon";
import { TopBar } from "@/components/TopBar";
import { cancelRequest, enroll } from "../actions";
import s from "../catalog.module.css";

export const metadata = { title: "Курс" };

/** Страница курса в каталоге: что внутри, цена, «Записаться на курс» */
export default async function CatalogCourse({ params, searchParams }: PageProps<"/catalog/[slug]">) {
  const user = await requireUser();
  const [data, xp, sp] = await Promise.all([catalogCourse((await params).slug, user), getXp(user.id), searchParams]);
  if (!data) notFound();
  const { course: c, enrolled, request, sections } = data;
  const paid = c.price > 0;
  const staff = isStaff(user);
  const payment = paid && !enrolled && !staff ? await getSetting("payment") : "";
  const hours = Math.round(data.minutes / 60);

  return (
    <>
      <TopBar xp={xp} left={<><Link href="/catalog">Каталог курсов</Link><span>/</span><b>{c.title}</b></>} />
      {sp.sent && <div className="ok-box" role="status">Заявка отправлена. Администратор проверит оплату и откроет доступ — курс появится в «Мои курсы».</div>}

      <section className={`card ${s.hero}`}>
        <CourseCover title={c.title} coverId={c.coverId} className={s.cover} />
        <div className={s.info}>
          <h1>{c.title}</h1>
          {c.description && <p className="muted">{c.description}</p>}
          <div className="row">
            <span className={s.price}>{fmtPrice(c.price)}</span>
            <span className="small muted">{data.lessons} {plural(data.lessons, "урок", "урока", "уроков")}{hours ? ` · около ${hours} ${plural(hours, "часа", "часов", "часов")}` : ""}</span>
          </div>

          {staff ? (
            <Link href={`/courses/${c.slug}`} className="btn pri"><Icon name="eye" size={18} />Открыть курс</Link>
          ) : enrolled ? (
            <Link href={`/courses/${c.slug}`} className="btn pri"><Icon name="right" size={18} />Перейти к курсу</Link>
          ) : request?.status === "new" ? (
            <div className={s.wait}>
              <b>Заявка отправлена {fmtDate(request.at)}</b>
              <span className="small">Администратор проверит оплату и откроет доступ.</span>
              <form action={cancelRequest.bind(null, request.id)}>
                <Confirm className="btn sm" message="Отменить заявку на курс?">Отменить заявку</Confirm>
              </form>
            </div>
          ) : !paid ? (
            <form action={enroll.bind(null, c.id)}><Submit pending="Записываем…"><Icon name="plus" size={18} />Записаться на курс</Submit></form>
          ) : (
            <form action={enroll.bind(null, c.id)} className={s.pay}>
              <b>Как оплатить</b>
              <div className="prose small" dangerouslySetInnerHTML={{ __html: renderMd(payment) }} />
              {request?.status === "rejected" && <p className="small" style={{ margin: 0, color: "var(--warn)" }}>Прошлая заявка отклонена — если оплатили, отправьте ещё раз или напишите в «Сообщения».</p>}
              <div className="field"><label htmlFor="note">Комментарий <span className="muted">(необязательно: как и когда оплатили)</span></label>
                <input id="note" name="note" className="ctl" placeholder="Например: перевод с карты Сбер, 15 октября" maxLength={500} /></div>
              <Submit pending="Отправляем…"><Icon name="plus" size={18} />Записаться на курс</Submit>
            </form>
          )}
        </div>
      </section>

      {sections.length > 0 && (
        <section className="card">
          <div className="card-h"><h2>Программа курса</h2></div>
          <ol className={s.plan}>
            {sections.map((sec) => (
              <li key={sec.id}>
                <b>{sec.title}</b>
                <ul>{sec.lessons.map((l) => <li key={l.id}>{l.title}</li>)}</ul>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
