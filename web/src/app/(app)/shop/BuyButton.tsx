"use client";

import { useState, useTransition } from "react";
import { buyItem } from "./actions";

export function BuyButton({ id, title, price, disabled, label }: { id: string; title: string; price: number; disabled: boolean; label?: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <button type="button" className="btn pri sm" disabled={disabled || pending} onClick={() => {
        if (!window.confirm(`Купить «${title}» за ${price} монет?`)) return;
        start(async () => {
          const r = await buyItem(id);
          setMsg("error" in r && r.error ? { ok: false, text: r.error } : { ok: true, text: "instant" in r && r.instant ? "Готово!" : "Заказ принят — администратор выдаст" });
        });
      }}>{pending ? "Покупаю…" : label ?? `Купить · ${price} 🪙`}</button>
      {msg && <span className={`small ${msg.ok ? "" : "err"}`} role="status">{msg.text}</span>}
    </div>
  );
}
