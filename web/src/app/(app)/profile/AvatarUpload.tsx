"use client";

import { useState, useTransition } from "react";
import { upload } from "@/lib/upload-client";
import { setAvatar } from "./actions";

/** Загрузить фото профиля (картинка до 5 МБ) */
export function AvatarUpload({ has }: { has: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <div className="row">
      <label className="btn sm">
        {busy ?? (has ? "Сменить фото" : "Загрузить фото")}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={!!busy} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const up = await upload(f, "", { kind: "avatar", onProgress: (p) => setBusy(`Загрузка ${p}%`) });
            start(() => setAvatar(up.id));
          } catch (x) { alert((x as Error).message); }
          setBusy(null);
        }} />
      </label>
      {has && <button type="button" className="btn sm" onClick={() => start(() => setAvatar(null))}>Убрать фото</button>}
    </div>
  );
}
