"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { marked } from "marked";
import s from "../../../../admin.module.css";

/** Текст урока в Markdown с живым предпросмотром — так его увидит студент */
export function MarkdownField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const deferred = useDeferredValue(value);
  const html = useMemo(() => marked.parse(deferred, { async: false }), [deferred]);
  return (
    <div className={s.editor}>
      <div className="field">
        <label htmlFor="md">Текст урока (Markdown)</label>
        <textarea id="md" name={name} value={value} onChange={(e) => setValue(e.target.value)}
          className="ctl mono" style={{ minHeight: 420, fontSize: 13.5 }} spellCheck />
        <span className="small muted">## Заголовок · **жирный** · `команда` · блок кода — между строками ```</span>
      </div>
      <div className="field">
        <span className="small muted" style={{ fontWeight: 500 }}>Предпросмотр</span>
        <div className={`prose ${s.preview}`} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
