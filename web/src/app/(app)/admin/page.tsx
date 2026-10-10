import Link from "next/link";
import { sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { demoCounts } from "@/db/demo";
import { requireStaff } from "@/lib/auth";
import { Confirm } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { plural } from "@/lib/format";
import { removeDemo } from "./actions";

export const metadata = { title: "Управление" };

const count = (table: typeof t.users | typeof t.groups | typeof t.courses | typeof t.exams) =>
  db.select({ n: sql<number>`count(*)::int` }).from(table).then((r) => r[0].n);

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const user = await requireStaff();
  const [users, groups, courses, exams, demo] = await Promise.all([
    count(t.users), count(t.groups), count(t.courses), count(t.exams), demoCounts(db),
  ]);
  const removed = (await searchParams).removed;

  const tiles = [
    { label: "Пользователи", n: users, href: "/admin/users", admin: true },
    { label: "Потоки", n: groups, href: "/admin/groups", admin: true },
    { label: "Курсы", n: courses, href: "/admin/courses", admin: false },
    { label: "Экзамены", n: exams, href: "/admin/exams", admin: false },
  ].filter((x) => user.role === "admin" || !x.admin);

  return (
    <>
      <div className="title"><h1>Управление</h1><p>Курсы, потоки, люди, расписание и экзамены</p></div>

      {typeof removed === "string" && (
        <div className="ok-box" role="status">Демо-данные удалены.</div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        {tiles.map((x) => (
          <Link key={x.href} href={x.href} className="card" style={{ color: "var(--ink)", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{x.label}</span>
            <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em" }}>{x.n}</span>
          </Link>
        ))}
      </div>

      {user.role === "admin" && demo.any && (
        <section className="card">
          <div className="card-h"><h2>Демо-данные</h2></div>
          <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
            В базе есть данные для знакомства: {demo.users} {plural(demo.users, "пользователь", "пользователя", "пользователей")} (включая
            demo@platforma.local), {demo.groups} {plural(demo.groups, "поток", "потока", "потоков")}, {demo.courses}{" "}
            {plural(demo.courses, "курс", "курса", "курсов")}
            {demo.exams ? `, ${demo.exams} ${plural(demo.exams, "экзамен", "экзамена", "экзаменов")}` : ""}. Удалите их перед запуском для настоящих студентов —
            ваши собственные курсы и пользователи не пострадают.
          </p>
          <form action={removeDemo}>
            <Confirm className="btn danger" message="Удалить все демо-данные? Это нельзя отменить.">
              <Icon name="trash" size={18} />Удалить демо-данные
            </Confirm>
          </form>
        </section>
      )}
    </>
  );
}
