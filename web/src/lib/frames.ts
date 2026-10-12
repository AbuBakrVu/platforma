/** Рамки аватара: открываются уровнем или покупаются в магазине */
export const FRAMES: { code: string; name: string; level?: number; shop?: boolean }[] = [
  { code: "leaf", name: "Листва", level: 3 },
  { code: "silver", name: "Серебро", level: 5 },
  { code: "gold", name: "Золото", level: 8 },
  { code: "fire", name: "Пламя", level: 12 },
  { code: "neon", name: "Неон", shop: true },
  { code: "rainbow", name: "Радуга", shop: true },
];
export const AVATAR_COLORS = ["#1E5A3C", "#2F6FD6", "#C2185B", "#B4600E", "#6A4BC4", "#0F8A8A", "#3D4A42", "#A23B2A"];
