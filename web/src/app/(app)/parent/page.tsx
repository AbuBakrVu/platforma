import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { myChildren } from "@/lib/parents";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Мои дети" };

/** Кабинет родителя: дети; если ребёнок один — сразу его страница */
export default async function ParentHome() {
  const user = await requireUser({ parents: true });
  if (user.role !== "parent") redirect("/");
  const kids = await myChildren(user.id);
  if (kids.length === 1) redirect(`/parent/${kids[0].id}`);
  return (
    <>
      <div className="title"><h1>Здравствуйте, {user.name.split(" ")[0]}!</h1><p>Здесь видно, как учатся ваши дети — простыми словами.</p></div>
      {kids.length ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
          {kids.map((k) => (
            <Link key={k.id} href={`/parent/${k.id}`} className="card" style={{ flexDirection: "row", alignItems: "center", color: "var(--ink)" }}>
              <Avatar user={k} size={56} />
              <div><b style={{ fontSize: 18 }}>{k.name}</b><div className="small muted">Ученик</div></div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="card"><p className="muted" style={{ margin: 0 }}>Ребёнок пока не привязан. Попросите у школы ссылку-приглашение для родителя.</p></section>
      )}
    </>
  );
}
