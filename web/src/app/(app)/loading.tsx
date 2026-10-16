/**
 * Заготовка страницы, пока сервер готовит ответ: после нажатия в меню она появляется сразу,
 * а Next.js может заранее подгрузить меню и эту заготовку для ссылок на экране.
 */
export default function Loading() {
  return (
    <div className="skel" role="status" aria-label="Загрузка…">
      <div className="skel-top"><i style={{ width: 180 }} /><i style={{ width: 120 }} /></div>
      <i className="skel-h1" />
      <i className="skel-p" />
      <div className="skel-grid">
        <div className="skel-card" /><div className="skel-card" /><div className="skel-card" />
      </div>
    </div>
  );
}
