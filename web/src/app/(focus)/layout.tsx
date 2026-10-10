import { requireUser } from "@/lib/auth";

/** Экраны «на весь экран» без бокового меню: экзамен, позже — лаборатория */
export default async function FocusLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>{children}</div>;
}
