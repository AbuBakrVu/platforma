import { fmtDateTime } from "@/lib/format";

/** Статус публикации: черновик, опубликован или выйдет в указанное время */
export function PubStatus({ published, publishAt }: { published: boolean; publishAt: Date | null }) {
  if (!published) return <span className="tag grey">Черновик</span>;
  if (publishAt && publishAt > new Date()) return <span className="tag warn">Выйдет {fmtDateTime(publishAt)}</span>;
  return <span className="tag">Опубликован</span>;
}
