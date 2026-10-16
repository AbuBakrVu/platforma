import { requireUser } from "@/lib/auth";
import { Celebrate } from "@/components/Celebrate";
import { ImpersonationBar } from "@/components/ImpersonationBar";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { getDueCount, getXp } from "@/lib/queries";
import { getCoinsCached, getStreakCached, levelOf } from "@/lib/gamify";
import { dailyQuestsCached } from "@/lib/quests";
import { unreadTotal } from "@/lib/chats";
import { Sidebar } from "@/components/Sidebar";
import { labsEnabled } from "@/lib/labs";
import { getFeatures } from "@/lib/features";
import { isStaff } from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser({ parents: true });
  const [due, [me], xp, coins, streak, quests, [duels], unread, [mentees]] = await Promise.all([
    getDueCount(user.id),
    db.select({ avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame }).from(t.users).where(eq(t.users.id, user.id)),
    getXp(user.id), getCoinsCached(user.id), getStreakCached(user.id), dailyQuestsCached(user.id),
    // Дуэли, где мой ход: соперник вызвал, а я ещё не отвечал
    db.select({ n: sql<number>`count(*)::int` }).from(t.duels).where(and(inArray(t.duels.status, ["pending", "active"]),
      or(and(eq(t.duels.opponentId, user.id), isNull(t.duels.opponentAnswers)), and(eq(t.duels.challengerId, user.id), isNull(t.duels.challengerAnswers))))),
    unreadTotal(user.id),
    db.select({ n: sql<number>`count(*)::int` }).from(t.mentorships).where(eq(t.mentorships.mentorId, user.id)),
  ]);
  // Счётчики рабочих разделов сотрудника: работы на проверке, заказы магазина к выдаче
  const staff = isStaff(user);
  const [[review], [orders], [requests]] = await Promise.all([
    staff && user.perms.includes("review")
      ? db.select({ n: sql<number>`count(*)::int` }).from(t.submissions).where(eq(t.submissions.status, "submitted")) : [{ n: 0 }],
    staff && user.perms.includes("shop")
      ? db.select({ n: sql<number>`count(*)::int` }).from(t.purchases).where(eq(t.purchases.status, "new")) : [{ n: 0 }],
    staff && user.perms.includes("people")
      ? db.select({ n: sql<number>`count(*)::int` }).from(t.courseRequests).where(eq(t.courseRequests.status, "new")) : [{ n: 0 }],
  ]);
  const features = await getFeatures();
  const lv = levelOf(xp);
  const game = {
    level: lv.level, title: lv.title, pct: lv.pct, coins, streak: streak.streak, streakToday: streak.today,
    quests: quests.filter((q) => q.done && !q.claimed).length, duels: duels.n, unread, mentees: mentees.n,
  };
  return (
    <>
    {user.impersonatorId && <ImpersonationBar name={user.name} />}
    <div className={`app ${staff ? "staff" : ""}`}>
      <Sidebar name={user.name} role={user.role} due={due} avatar={me} game={game} external={user.external}
        impersonating={!!user.impersonatorId} perms={user.perms} staffCounts={{ review: review.n, orders: orders.n, requests: requests.n }} labs={labsEnabled()} features={features} />
      <main className="main">{children}</main>
      <Celebrate />
    </div>
    </>
  );
}
