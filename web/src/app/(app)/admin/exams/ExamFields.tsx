type Exam = {
  title: string; description: string; courseId: string | null; durationMin: number; passPercent: number; xp: number;
  shuffleQuestions: boolean; shuffleOptions: boolean; review: "full" | "mistakes" | "score";
};

/** Общие поля формы экзамена (создание и редактирование) */
export function ExamFields({ exam, courses }: { exam?: Exam; courses: { id: string; title: string }[] }) {
  return (
    <>
      <div className="form-row">
        <div className="field"><label htmlFor="x-title">Название</label>
          <input id="x-title" name="title" defaultValue={exam?.title} className="ctl" placeholder="Например, Kubernetes. Пробный экзамен" required /></div>
        <div className="field"><label htmlFor="x-course">Курс (кто увидит экзамен)</label>
          <select id="x-course" name="courseId" defaultValue={exam?.courseId ?? ""} className="ctl">
            <option value="">Все ученики</option>
            {courses.map((c) => <option key={c.id} value={c.id}>Записанные на курс «{c.title}»</option>)}
          </select></div>
      </div>
      <div className="form-row">
        <div className="field"><label htmlFor="x-dur">Время, минут</label>
          <input id="x-dur" name="durationMin" type="number" min={1} max={600} defaultValue={exam?.durationMin ?? 45} className="ctl" /></div>
        <div className="field"><label htmlFor="x-pass">Проходной балл, % от суммы баллов</label>
          <input id="x-pass" name="passPercent" type="number" min={1} max={100} defaultValue={exam?.passPercent ?? 80} className="ctl" /></div>
        <div className="field"><label htmlFor="x-xp">XP за сдачу</label>
          <input id="x-xp" name="xp" type="number" min={0} max={10000} defaultValue={exam?.xp ?? 200} className="ctl" /></div>
      </div>
      <div className="field"><label htmlFor="x-desc">Описание для учеников</label>
        <input id="x-desc" name="description" defaultValue={exam?.description} className="ctl" placeholder="Формат как на настоящем экзамене…" /></div>
      <div className="form-row">
        <div className="field" style={{ gap: 10 }}>
          <label className="check"><input type="checkbox" name="shuffleQuestions" defaultChecked={exam?.shuffleQuestions} />
            Перемешивать вопросы — у каждой попытки свой порядок</label>
          <label className="check"><input type="checkbox" name="shuffleOptions" defaultChecked={exam?.shuffleOptions} />
            Перемешивать варианты ответа</label>
        </div>
        <div className="field"><label htmlFor="x-review">После сдачи показывать</label>
          <select id="x-review" name="review" defaultValue={exam?.review ?? "full"} className="ctl">
            <option value="full">Разбор: ответы, правильные варианты и объяснения</option>
            <option value="mistakes">Только где ошибки — без правильных ответов</option>
            <option value="score">Только итоговый балл</option>
          </select></div>
      </div>
    </>
  );
}
