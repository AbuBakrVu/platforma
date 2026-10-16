"use client";

import { useState } from "react";
import { MarkdownEditor } from "@/components/LazyEditor";

/** Текст политики в визуальном редакторе; уходит в форму скрытым полем. Редактор грузится только по кнопке */
export function PolicyEditor({ initial }: { initial: string }) {
  const [md, setMd] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <>
      <input type="hidden" name="policy" value={md} />
      {open
        ? <MarkdownEditor value={md} onChange={setMd} courseId="" label="Текст" minHeight={320} />
        : <div><button type="button" className="btn sm" onClick={() => setOpen(true)}>Изменить текст политики</button></div>}
    </>
  );
}
