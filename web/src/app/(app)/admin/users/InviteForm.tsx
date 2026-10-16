"use client";

import { useState } from "react";
import { Submit } from "@/components/Buttons";
import { Icon } from "@/components/Icon";
import { createInvite } from "./actions";

type Opt = { id: string; name: string };
const KINDS = {
  student: "Ученик",
  teacher: "Сотрудник (преподаватель, куратор, методист…)",
  parent: "Родитель ученика",
} as const;

/** Новое приглашение: поля меняются в зависимости от того, кого приглашаем */
export function InviteForm({ courses, roles, students }: { courses: Opt[]; roles: Opt[]; students: Opt[] }) {
  const [kind, setKind] = useState<keyof typeof KINDS>("student");
  return (
    <form action={createInvite} className="form">
      <div className="form-row">
        <div className="field">
          <label htmlFor="i-kind">Кого приглашаем</label>
          <select id="i-kind" name="kind" className="ctl" value={kind} onChange={(e) => setKind(e.target.value as keyof typeof KINDS)}>
            {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {kind === "teacher" && (
          <div className="field"><label htmlFor="i-role">Роль доступа</label>
            <select id="i-role" name="accessRoleId" className="ctl" defaultValue="">
              <option value="">Преподаватель (по умолчанию)</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
        )}
        {kind === "parent" && (
          <div className="field"><label htmlFor="i-child">Чей родитель</label>
            <select id="i-child" name="childId" className="ctl" required defaultValue="">
              <option value="" disabled>Выберите ученика</option>{students.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></div>
        )}
        <div className="field"><label htmlFor="i-max">Сколько раз можно использовать</label>
          <input id="i-max" name="maxUses" type="number" min={1} className="ctl" placeholder="без ограничения" defaultValue={kind === "parent" ? 2 : undefined} /></div>
        <div className="field"><label htmlFor="i-days">Действует, дней</label>
          <input id="i-days" name="days" type="number" min={1} max={365} defaultValue={14} className="ctl" /></div>
      </div>
      {kind === "student" && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Курсы, которые откроются сразу <span className="muted">(необязательно — например, уже оплаченные)</span></legend>
          <div className="row" style={{ gap: 16 }}>
            {courses.map((c) => <label key={c.id} className="check"><input type="checkbox" name="courseId" value={c.id} />{c.name}</label>)}
          </div>
        </fieldset>
      )}
      <div className="field"><label htmlFor="i-note">Заметка (видна только вам)</label>
        <input id="i-note" name="note" className="ctl" placeholder="Например, оплатил наличными 15 октября" /></div>
      <div><Submit><Icon name="plus" size={18} />Создать код</Submit></div>
    </form>
  );
}
