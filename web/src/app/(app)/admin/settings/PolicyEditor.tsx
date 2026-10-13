"use client";

import { useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";

/** Текст политики в визуальном редакторе; уходит в форму скрытым полем */
export function PolicyEditor({ initial }: { initial: string }) {
  const [md, setMd] = useState(initial);
  return (
    <>
      <input type="hidden" name="policy" value={md} />
      <MarkdownEditor value={md} onChange={setMd} courseId="" label="Текст" minHeight={320} />
    </>
  );
}
