import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Верхняя строка экрана: слева заголовок/крошки, справа XP и действия */
export function TopBar({ left, xp, children }: { left: ReactNode; xp: number; children?: ReactNode }) {
  return (
    <header className="top">
      <div className="crumbs">{left}</div>
      <div className="row">
        <span className="pill">
          <Icon name="bolt" size={16} className="xp-ic" />
          {xp.toLocaleString("ru-RU")} XP
        </span>
        {children}
      </div>
    </header>
  );
}
