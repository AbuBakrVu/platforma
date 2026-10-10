"use client";

import { useEffect, useRef } from "react";
import { markSeen } from "@/app/(app)/courses/[slug]/[lessonId]/actions";

/** Отмечает текстовый шаг или документ просмотренным, когда студент до него долистал */
export function Seen({ stepId }: { stepId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      markSeen(stepId).catch(() => {});
    });
    io.observe(el);
    return () => io.disconnect();
  }, [stepId]);
  return <div ref={ref} aria-hidden style={{ height: 1 }} />;
}
