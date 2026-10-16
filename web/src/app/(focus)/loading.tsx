/** Заготовка экрана экзамена или лаборатории, пока сервер готовит ответ */
export default function Loading() {
  return (
    <div className="skel" role="status" aria-label="Загрузка…">
      <div className="skel-top"><i style={{ width: 220 }} /><i style={{ width: 100 }} /></div>
      <div className="skel-card" style={{ height: 420 }} />
    </div>
  );
}
