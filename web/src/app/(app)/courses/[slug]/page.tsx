import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCourseOutline } from "@/lib/queries";

/** /courses/<slug> ведёт сразу на текущий (первый непройденный) урок */
export default async function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  const { slug } = await params;
  const user = await requireUser();
  const outline = await getCourseOutline(slug, user);
  if (!outline) notFound();
  const target = outline.next ?? outline.flat[0];
  if (!target) notFound();
  redirect(`/courses/${slug}/${target.id}`);
}
