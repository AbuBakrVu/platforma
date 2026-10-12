import { getUser } from "@/lib/auth";
import { uuidOrNull } from "@/lib/form";
import { exportCourse } from "@/lib/transfer";

/** Скачать курс архивом: шаги, файлы, SCORM-пакеты, материалы. Только персонал. */
export async function GET(_req: Request, ctx: RouteContext<"/api/courses/[id]/export">) {
  const user = await getUser();
  if (!user || user.role === "student") return new Response("Нет доступа", { status: 403 });
  const id = uuidOrNull((await ctx.params).id);
  const out = id ? await exportCourse(id) : null;
  if (!out) return new Response("Курс не найден", { status: 404 });
  return new Response(out.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(out.name)}`,
      "Cache-Control": "no-store",
    },
  });
}
