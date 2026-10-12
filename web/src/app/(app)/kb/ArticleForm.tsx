"use client";

import { useActionState, useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { saveArticle } from "./actions";

type Opt = { id: string; title: string };

export function ArticleForm({ article, parents, parentId }: {
  article?: { id: string; title: string; slug: string; body: string; parentId: string | null; published: boolean; position: number };
  parents: Opt[]; parentId?: string | null;
}) {
  const [body, setBody] = useState(article?.body ?? "");
  const [state, action, pending] = useActionState(saveArticle.bind(null, article?.id ?? null), null);
  return (
    <form action={action} className="card form">
      <div className="form-row">
        <div className="field"><label htmlFor="kb-t">Заголовок</label><input id="kb-t" name="title" defaultValue={article?.title} className="ctl" required /></div>
        <div className="field"><label htmlFor="kb-s">Адрес (латиницей)</label><input id="kb-s" name="slug" defaultValue={article?.slug} className="ctl mono" placeholder="создастся из заголовка" /></div>
        <div className="field"><label htmlFor="kb-p">Раздел</label>
          <select id="kb-p" name="parentId" defaultValue={article?.parentId ?? parentId ?? ""} className="ctl">
            <option value="">— верхний уровень —</option>
            {parents.filter((p) => p.id !== article?.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select></div>
        <div className="field"><label htmlFor="kb-o">Порядок</label><input id="kb-o" name="position" type="number" min={0} defaultValue={article?.position ?? 0} className="ctl" /></div>
      </div>
      <input type="hidden" name="body" value={body} />
      <MarkdownEditor value={body} onChange={setBody} courseId="" label="Текст статьи" publicUploads />
      <label className="check"><input type="checkbox" name="published" defaultChecked={article?.published ?? true} /> Опубликована — видна всем</label>
      {state?.error && <span className="err" role="alert">{state.error}</span>}
      <div><button className="btn pri" disabled={pending}>{pending ? "Сохраняю…" : "Сохранить"}</button></div>
    </form>
  );
}
