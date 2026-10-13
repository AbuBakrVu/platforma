/**
 * Телефон к одному виду +77001234567. Принимает «8 700 123 45 67», «+7 (700) 123-45-67», «7001234567».
 * Вернёт null, если это не похоже на номер.
 */
export function normPhone(v: string): string | null {
  const raw = v.trim();
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  if (d.length === 11 && d.startsWith("7")) return `+${d}`;
  return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
}

/** +77001234567 → +7 700 123 45 67 */
export const fmtPhone = (p: string | null | undefined) =>
  !p ? "" : p.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 $1 $2 $3 $4");

/** Похоже на почту, а не на телефон */
export const looksLikeEmail = (v: string) => v.includes("@");
