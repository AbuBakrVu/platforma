import { signOut } from "@/app/(auth)/login/actions";

/** Полоса сверху, пока администратор смотрит платформу глазами пользователя */
export function ImpersonationBar({ name }: { name: string }) {
  return (
    <form action={signOut} className="imp-bar" role="status">
      <span>👁 Вы смотрите платформу глазами <b>{name}</b>. Всё, что вы сделаете, будет от имени этого пользователя; вход записан в журнал.</span>
      <button className="btn sm">Вернуться в свой аккаунт</button>
    </form>
  );
}
