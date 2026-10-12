import Link from "next/link";
import type { KbNode } from "@/lib/kb";
import s from "./kb.module.css";

/** Оглавление базы знаний */
export function Tree({ nodes, current }: { nodes: KbNode[]; current?: string }) {
  if (!nodes.length) return null;
  return (
    <ul className={s.tree}>
      {nodes.map((n) => (
        <li key={n.id}>
          <Link href={`/kb/${n.slug}`} className={n.slug === current ? s.on : undefined} aria-current={n.slug === current ? "page" : undefined}>
            {n.title}{!n.published && <small> · черновик</small>}
          </Link>
          <Tree nodes={n.children} current={current} />
        </li>
      ))}
    </ul>
  );
}
