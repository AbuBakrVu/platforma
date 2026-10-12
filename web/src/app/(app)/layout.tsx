import { requireUser } from "@/lib/auth";
import { Celebrate } from "@/components/Celebrate";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema as t } from "@/db";
import { getDueCount, getGroupName } from "@/lib/queries";
import { getCoins, getStreak, levelOf, totalXp } from "@/lib/gamify";
import { dailyQuests } from "@/lib/quests";
import { unreadTotal } from "@/lib/chats";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [group, due, [me], xp, coins, streak, quests, [duels], unread, [mentees]] = await Promise.all([
    getGroupName(user.groupId), getDueCount(user.id),
    db.select({ avatarId: t.users.avatarId, avatarColor: t.users.avatarColor, frame: t.users.frame }).from(t.users).where(eq(t.users.id, user.id)),
    totalXp(user.id), getCoins(user.id), getStreak(user.id), dailyQuests(user.id),
    // Дуэли, где мой ход: соперник вызвал, а я ещё не отвечал
    db.select({ n: sql<number>`count(*)::int` }).from(t.duels).where(and(inArray(t.duels.status, ["pending", "active"]),
      or(and(eq(t.duels.opponentId, user.id), isNull(t.duels.opponentAnswers)), and(eq(t.duels.challengerId, user.id), isNull(t.duels.challengerAnswers))))),
    unreadTotal(user.id),
    db.select({ n: sql<number>`count(*)::int` }).from(t.mentorships).where(eq(t.mentorships.mentorId, user.id)),
  ]);
  const lv = levelOf(xp);
  const game = {
    level: lv.level, title: lv.title, pct: lv.pct, coins, streak: streak.streak, streakToday: streak.today,
    quests: quests.filter((q) => q.done && !q.claimed).length, duels: duels.n, unread, mentees: mentees.n,
  };
  return (
    <div className="app">
      <Sidebar name={user.name} role={user.role} group={group} due={due} avatar={me} game={game} />
      <main className="main">{children}</main>
      <Celebrate />
    </div>
  );
}
