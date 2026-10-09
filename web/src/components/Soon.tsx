import { requireUser } from "@/lib/auth";
import { getXp } from "@/lib/queries";
import { TopBar } from "./TopBar";

/** Заглушка раздела, который ещё в разработке */
export async function Soon({ title, text }: { title: string; text: string }) {
  const user = await requireUser();
  const xp = await getXp(user.id);
  return (
    <>
      <TopBar left={<b>{title}</b>} xp={xp} />
      <div className="title"><h1>{title}</h1><p>{text}</p></div>
      <section className="card"><p className="muted" style={{ margin: 0 }}>Раздел в разработке.</p></section>
    </>
  );
}
