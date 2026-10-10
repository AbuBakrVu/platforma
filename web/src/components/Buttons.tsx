"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./Icon";

/** Кнопка отправки формы: блокируется, пока действие выполняется */
export function Submit({ children, pending, className = "btn pri" }: { children: ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-busy={busy}>
      {busy && pending ? pending : children}
    </button>
  );
}

/** Кнопка с подтверждением — для удаления и других необратимых действий */
export function Confirm({ message, children, className = "btn" }: { message: string; children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}

/** Скопировать текст (ссылку-приглашение) в буфер */
export function Copy({ text, label = "Копировать" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn" style={{ height: 36 }} onClick={async () => {
      const full = text.startsWith("/") ? window.location.origin + text : text;
      await navigator.clipboard.writeText(full);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>
      <Icon name={done ? "check" : "copy"} size={16} />
      {done ? "Скопировано" : label}
    </button>
  );
}
