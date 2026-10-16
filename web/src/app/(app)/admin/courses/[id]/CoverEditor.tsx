"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CourseCover } from "@/components/CourseCover";
import { Icon } from "@/components/Icon";
import { shrinkImage, upload } from "@/lib/upload-client";
import { setCourseCover } from "../actions";
import s from "@/components/course-card.module.css";

/** Обложка карточки курса: загрузить картинку или убрать */
export function CoverEditor({ courseId, title, coverId }: { courseId: string; title: string; coverId: string | null }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const pick = async (f: File) => {
    if (!f.type.startsWith("image/")) { alert("Нужна картинка: JPG, PNG или WebP"); return; }
    try {
      const up = await upload(await shrinkImage(f, 1280), courseId, { onProgress: (p) => setBusy(`Загрузка ${p}%`) });
      start(async () => { await setCourseCover(courseId, up.id); router.refresh(); setBusy(null); });
    } catch (e) {
      alert((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="field">
      <span className="small muted">Обложка — картинка на карточке курса. Лучше горизонтальная, примерно 1600×900.</span>
      <div className={s.coverBox}><CourseCover title={title} coverId={coverId} /></div>
      <div className="row">
        <button type="button" className="btn sm" disabled={!!busy} onClick={() => file.current?.click()}>
          <Icon name="plus" size={16} />{busy ?? (coverId ? "Заменить обложку" : "Загрузить обложку")}
        </button>
        {coverId && !busy && (
          <button type="button" className="btn sm" onClick={() => start(async () => { await setCourseCover(courseId, null); router.refresh(); })}>Убрать</button>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }} />
      </div>
    </div>
  );
}
