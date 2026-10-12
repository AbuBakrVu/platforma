import { asc, eq } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { authors, reactionsFor } from "@/lib/community";
import { renderUserMd } from "@/lib/user-md";
import { CommentItem, type CommentView } from "./CommentItem";
import { NewComment } from "./NewComment";

/** Обсуждение под уроком */
export async function LessonComments({ lessonId, user }: { lessonId: string; user: CurrentUser }) {
  const rows = await db.select().from(t.comments).where(eq(t.comments.lessonId, lessonId)).orderBy(asc(t.comments.createdAt)).limit(500);
  const [people, reacts] = await Promise.all([authors(rows.map((r) => r.userId)), reactionsFor("comment", rows.map((r) => r.id), user.id)]);
  const view = (r: (typeof rows)[number]): CommentView => ({
    id: r.id, parentId: r.parentId, html: r.deletedAt ? "" : renderUserMd(r.body), raw: r.deletedAt ? "" : r.body,
    at: r.createdAt.toISOString(), edited: !!r.editedAt, deleted: !!r.deletedAt,
    author: people.get(r.userId)!, reactions: reacts.get(r.id) ?? [],
  });
  const roots = rows.filter((r) => !r.parentId);
  const visible = rows.filter((r) => !r.deletedAt).length;
  const canModerate = user.role !== "student";

  return (
    <section className="card" id="comments" aria-label="Обсуждение урока">
      <div className="card-h"><h2>Обсуждение</h2><span className="small muted">{visible ? `${visible} коммент.` : "пока пусто"}</span></div>
      <NewComment lessonId={lessonId} />
      {roots.map((r) => {
        const replies = rows.filter((x) => x.parentId === r.id);
        if (r.deletedAt && !replies.length) return null;
        return (
          <CommentItem key={r.id} c={view(r)} lessonId={lessonId} me={user.id} canModerate={canModerate}
            replies={replies.length ? replies.map((x) => <CommentItem key={x.id} c={view(x)} lessonId={lessonId} me={user.id} canModerate={canModerate} />) : undefined} />
        );
      })}
    </section>
  );
}
