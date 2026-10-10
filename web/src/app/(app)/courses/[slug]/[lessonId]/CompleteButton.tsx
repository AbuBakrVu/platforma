"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Icon } from "@/components/Icon";
import { completeLesson } from "./actions";

/** Завершить урок. Если остались обязательные шаги — подсказывает, какой именно. */
export function CompleteButton({ slug, lessonId, label }: { slug: string; lessonId: string; label: string }) {
  const [state, action, pending] = useActionState(async () => (await completeLesson(slug, lessonId)) ?? null, null);
  return (
    <form action={action} className="row" style={{ justifyContent: "flex-end" }}>
      {state?.error && (
        <span className="notice small" role="alert">
          {state.error}. <Link href={`?step=${state.step}`}>Перейти к шагу</Link>
        </span>
      )}
      <button className="btn pri" disabled={pending}>{pending ? "Сохраняю…" : label}<Icon name="right" size={18} /></button>
    </form>
  );
}
