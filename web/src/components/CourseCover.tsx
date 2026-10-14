/** Обложка курса: картинка или заглушка в фирменном цвете с первой буквой названия */
import s from "./course-card.module.css";

const TINTS = ["#1E5A3C", "#2F6B4F", "#3A5A40", "#24543F", "#466B54"];

export function CourseCover({ title, coverId, className = "" }: { title: string; coverId: string | null; className?: string }) {
  if (coverId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/files/${coverId}`} alt="" className={`${s.cover} ${className}`} loading="lazy" />;
  }
  const tint = TINTS[[...title].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <div className={`${s.cover} ${s.blank} ${className}`} style={{ background: `linear-gradient(135deg, ${tint}, #0E1611)` }} aria-hidden>
      <span>{title.trim()[0]?.toUpperCase() ?? "К"}</span>
    </div>
  );
}
