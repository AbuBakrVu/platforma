"use client";

import { addComment } from "@/app/(app)/community/actions";
import { Composer } from "./Composer";

export function NewComment({ lessonId }: { lessonId: string }) {
  return <Composer placeholder="Задайте вопрос или поделитесь находкой" submit="Отправить" send={(text) => addComment(lessonId, text, null)} />;
}
