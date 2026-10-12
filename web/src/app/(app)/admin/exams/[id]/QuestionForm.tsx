"use client";

import { useActionState } from "react";
import { saveQuestion, type QuestionState } from "../actions";

const KIND = { single: "Один ответ", multiple: "Несколько ответов", order: "Порядок" } as const;
const HINT = "По варианту на строку. Правильные отметьте * в начале строки. Для «Порядка» пишите строки в правильном порядке — студенту они покажутся перемешанными.";

/** Форма вопроса: ошибка показывается рядом, введённый текст не теряется */
export function QuestionForm({ examId, q }: {
  examId: string;
  q?: { id: string; kind: keyof typeof KIND; prompt: string; optionsText: string; points: number; explanation: string };
}) {
  const [state, action, pending] = useActionState<QuestionState, FormData>(saveQuestion.bind(null, examId, q?.id ?? null), {});
  const id = q?.id ?? "new";
  const v = state.values ?? (q ? { kind: q.kind, prompt: q.prompt, options: q.optionsText, points: String(q.points), explanation: q.explanation } : undefined);
  return (
    <form action={action} className="form">
      <div className="form-row">
        <div className="field"><label htmlFor={`k-${id}`}>Тип вопроса</label>
          <select id={`k-${id}`} name="kind" defaultValue={v?.kind ?? "single"} className="ctl">
            {Object.entries(KIND).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select></div>
        <div className="field"><label htmlFor={`pt-${id}`}>Баллов за вопрос</label>
          <input id={`pt-${id}`} name="points" type="number" min={1} max={100} defaultValue={v?.points ?? "1"} className="ctl" /></div>
      </div>
      <div className="field"><label htmlFor={`p-${id}`}>Вопрос</label>
        <textarea id={`p-${id}`} name="prompt" defaultValue={v?.prompt} className="ctl" style={{ minHeight: 80 }} required /></div>
      <div className="field"><label htmlFor={`o-${id}`}>Варианты</label>
        <textarea id={`o-${id}`} name="options" className="ctl mono" style={{ minHeight: 130, fontSize: 13.5 }} required
          defaultValue={v?.options} placeholder={"* Межсетевой экран\nКоммутатор 2 уровня\nБалансировщик нагрузки"}
          aria-describedby={`h-${id}`} />
        <span id={`h-${id}`} className="small muted">{HINT}</span></div>
      <div className="field"><label htmlFor={`e-${id}`}>Объяснение <span className="muted">(показывается в разборе после экзамена)</span></label>
        <textarea id={`e-${id}`} name="explanation" defaultValue={v?.explanation} className="ctl" style={{ minHeight: 64 }}
          placeholder="Почему правильный ответ именно такой" /></div>
      {state.error && <div className="notice" role="alert">{state.error}</div>}
      <div><button className="btn pri sm" disabled={pending}>{pending ? "Сохраняю…" : q ? "Сохранить вопрос" : "Добавить вопрос"}</button></div>
    </form>
  );
}
