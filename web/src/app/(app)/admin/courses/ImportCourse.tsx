"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { upload } from "@/lib/upload-client";

/** Загрузить курс из архива, скачанного кнопкой «Скачать курс» (на этой или другой установке платформы) */
export function ImportCourse() {
  const router = useRouter();
  const [state, setState] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="row">
      {err && <span className="err" role="alert">{err}</span>}
      <label className="btn" title="Файл .platforma.zip, скачанный кнопкой «Скачать курс»">
        <Icon name="dl" size={18} />{state ?? "Загрузить курс из архива"}
        <input type="file" accept=".zip,application/zip" hidden disabled={!!state} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setErr(null);
          try {
            const r = await upload<{ id: string }>(f, "", {
              kind: "course", onProgress: (p) => setState(p < 100 ? `Загрузка ${p}%` : "Импортирую…"),
            });
            router.push(`/admin/courses/${r.id}`);
          } catch (x) {
            setErr((x as Error).message);
            setState(null);
          }
        }} />
      </label>
    </div>
  );
}
