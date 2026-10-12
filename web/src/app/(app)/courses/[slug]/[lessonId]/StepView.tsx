import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema as t } from "@/db";
import type { CurrentUser } from "@/lib/auth";
import { md, renderMd } from "@/lib/markdown";
import { packageStateFor } from "@/lib/progress";
import { embedUrl, parseChapters, parseStep, publicQuiz, type StepKind } from "@/lib/steps";
import { fmtDateFull, plural } from "@/lib/format";
import { lastTasksDone } from "@/lib/labs";
import { Icon } from "@/components/Icon";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { Assignment } from "@/components/steps/Assignment";
import { CardDeck } from "@/components/steps/CardDeck";
import { PackagePlayer } from "@/components/steps/PackagePlayer";
import { Quiz } from "@/components/steps/Quiz";
import { Seen } from "@/components/steps/Seen";
import st from "@/components/steps/steps.module.css";

export type StepRow = { id: string; kind: StepKind; title: string; content: Record<string, unknown>; done: boolean; data: Record<string, unknown> | null };

const inline = (s: string) => md.parseInline(s, { async: false });
const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1048576).toFixed(1)} МБ`);

/** Содержимое шага для студента */
export async function StepView({ step, user }: { step: StepRow; user: CurrentUser }) {
  switch (step.kind) {
    case "text": {
      const c = parseStep("text", step.content);
      return <><div className="prose" dangerouslySetInnerHTML={{ __html: renderMd(c.md) }} />{!step.done && <Seen stepId={step.id} />}</>;
    }

    case "video": {
      const c = parseStep("video", step.content);
      if (c.source === "url") {
        const src = embedUrl(c.url);
        if (!c.url) return <p className="empty">Видео ещё не добавлено.</p>;
        return src
          ? <div className={st.embed}><iframe src={src} title={step.title || "Видео"} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen /></div>
          : <VideoPlayer stepId={step.id} sources={[{ src: c.url, label: "" }]} tracks={[]} chapters={parseChapters(c.chapters)}
              watermark={c.watermark ? `${user.name} · ${user.email}` : null}
              startAt={Number(step.data?.position ?? 0)} watchedPct={Number(step.data?.watchedPct ?? 0)} />;
      }
      if (!c.files.length) return <p className="empty">Видео ещё не загружено.</p>;
      return (
        <VideoPlayer stepId={step.id}
          sources={c.files.map((f) => ({ src: `/api/files/${f.uploadId}`, label: f.label }))}
          tracks={c.subtitles.map((x) => ({ src: `/api/files/${x.uploadId}`, label: x.label || x.lang, lang: x.lang }))}
          chapters={parseChapters(c.chapters)}
          watermark={c.watermark ? `${user.name} · ${user.email} · ${fmtDateFull(new Date())}` : null}
          startAt={Number(step.data?.position ?? 0)} watchedPct={Number(step.data?.watchedPct ?? 0)} />
      );
    }

    case "file": {
      const c = parseStep("file", step.content);
      if (!c.uploadId) return <p className="empty">Документ ещё не загружен.</p>;
      const [f] = await db.select().from(t.uploads).where(eq(t.uploads.id, c.uploadId));
      if (!f) return <p className="empty">Файл не найден.</p>;
      const viewId = f.mime === "application/pdf" ? f.id : f.pdfId;
      return (
        <div className="grid">
          {c.note && <div className="prose" dangerouslySetInnerHTML={{ __html: renderMd(c.note) }} />}
          {viewId && <iframe className={st.doc} src={`/api/files/${viewId}#view=FitH${c.allowDownload ? "" : "&toolbar=0"}`} title={f.name} />}
          {!viewId && f.mime.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={st.docImg} src={`/api/files/${f.id}`} alt={f.name} />
          )}
          {(c.allowDownload || (!viewId && !f.mime.startsWith("image/"))) && (
            <div className={st.fileCard}>
              <Icon name="doc" size={24} />
              <div style={{ flex: 1, minWidth: 0 }}><b>{f.name}</b><span className="small muted">{size(f.size)}</span></div>
              <a className="btn sm" href={`/api/files/${f.id}?dl=1`}><Icon name="dl" size={16} />Скачать</a>
            </div>
          )}
          {!step.done && <Seen stepId={step.id} />}
        </div>
      );
    }

    case "quiz": {
      const q = parseStep("quiz", step.content);
      const last = step.data && Array.isArray(step.data.answer)
        ? { answer: step.data.answer as string[], correct: step.data.correct === true } : null;
      return (
        <Quiz stepId={step.id} q={publicQuiz(q)} promptHtml={renderMd(q.prompt)} last={last}
          optionHtml={Object.fromEntries(q.options.map((o) => [o.id, inline(o.text)]))} />
      );
    }

    case "cards": {
      const c = parseStep("cards", step.content);
      const states = c.cards.length
        ? await db.select().from(t.cardReviews).where(and(eq(t.cardReviews.userId, user.id), eq(t.cardReviews.stepId, step.id),
          inArray(t.cardReviews.cardId, c.cards.map((x) => x.id))))
        : [];
      const byId = new Map(states.map((x) => [x.cardId, x]));
      return (
        <CardDeck title={step.title || "Карточки"} cards={c.cards.map((x) => {
          const s = byId.get(x.id);
          return { id: x.id, stepId: step.id, frontHtml: renderMd(x.front), backHtml: renderMd(x.back),
            state: s ? { ease: s.ease, intervalDays: s.intervalDays, reps: s.reps } : null };
        })} />
      );
    }

    case "lab": {
      const lab = parseStep("lab", step.content);
      const done = new Set(await lastTasksDone(user.id, step.id));
      return (
        <div className={st.labCard}>
          <div className={st.labHead}>
            <Icon name="term" size={22} />
            <div><b>Лабораторная работа</b><span className="small muted">
              Своя учебная среда с терминалом · {lab.tasks.length} {plural(lab.tasks.length, "задание", "задания", "заданий")} · до {lab.ttlMin} мин
            </span></div>
          </div>
          <ol className={st.labTasks}>
            {lab.tasks.map((x) => <li key={x.id} className={done.has(x.id) ? st.labDone : undefined}>{done.has(x.id) && <Icon name="check" size={14} />}{x.title}</li>)}
          </ol>
          <div><a href={`/labs/${step.id}`} className="btn pri"><Icon name="term" size={18} />{done.size ? "Продолжить лабораторную" : "Открыть лабораторную"}</a></div>
        </div>
      );
    }

    case "assignment": {
      const a = parseStep("assignment", step.content);
      const subs = await db.select().from(t.submissions)
        .where(and(eq(t.submissions.stepId, step.id), eq(t.submissions.userId, user.id))).orderBy(desc(t.submissions.attempt));
      return (
        <Assignment stepId={step.id} html={renderMd(a.md)} allowText={a.allowText} allowFiles={a.allowFiles} rubric={a.rubric}
          history={subs.map((x) => ({
            id: x.id, attempt: x.attempt, status: x.status, text: x.text, files: x.files, score: x.score, maxScore: x.maxScore,
            feedback: x.feedback, scores: x.scores, at: x.submittedAt.toISOString(),
          }))} />
      );
    }

    case "package": {
      const c = parseStep("package", step.content);
      if (!c.packageId) return <p className="empty">Модуль ещё не загружен.</p>;
      const [pkg] = await db.select().from(t.packages).where(eq(t.packages.id, c.packageId));
      if (!pkg) return <p className="empty">Модуль не найден.</p>;
      const state = await packageStateFor(user.id, pkg.id);
      return (
        <PackagePlayer pkg={{ id: pkg.id, kind: pkg.kind, launch: pkg.launch, activityId: pkg.activityId, launchMethod: pkg.launchMethod }}
          learner={{ id: user.id, name: user.name, email: user.email }} token={state.token} registration={state.registration}
          cmi={(state.data.cmi ?? {}) as Record<string, string>} height={c.height} completed={state.completed} score={state.scorePercent} />
      );
    }
  }
}
