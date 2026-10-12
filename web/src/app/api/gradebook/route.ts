import { eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { can, getUser } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { gradebook } from "@/lib/gradebook";
import { xlsx } from "@/lib/xlsx";

/** Журнал оценок в Excel (.xlsx) — только персоналу */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user || !can(user, "gradebook")) return new Response("Нет доступа", { status: 403 });
  const q = new URL(req.url).searchParams;
  const groupId = uuidOrNull(q.get("group") ?? ""), courseId = uuidOrNull(q.get("course") ?? "");
  if (!groupId || !courseId) return new Response("Укажите поток и курс", { status: 400 });
  const [[g], [c]] = await Promise.all([
    db.select({ name: t.groups.name }).from(t.groups).where(eq(t.groups.id, groupId)),
    db.select({ title: t.courses.title, slug: t.courses.slug }).from(t.courses).where(eq(t.courses.id, courseId)),
  ]);
  if (!g || !c) return new Response("Не найдено", { status: 404 });
  const { columns, rows } = await gradebook(groupId, courseId);
  const data: (string | number | null)[][] = [
    ["Студент", "Email", ...columns.map((col) => col.title)],
    ...rows.map((r) => [r.student.name, r.student.email, ...columns.map((col) => {
      const cell = r.cells[col.key];
      // Проценты — числом (удобно считать в Excel), остальное — как в таблице
      return col.kind === "exam" || col.kind === "total" ? cell?.value ?? null : cell?.text ?? "";
    })]),
  ];
  const file = xlsx(`${g.name} · ${c.title}`, data);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Журнал ${g.name} ${c.slug}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
