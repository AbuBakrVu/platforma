import type { Metadata } from "next";
import { Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const onest = Onest({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

// Шрифт для кода нужен не на каждой странице — браузер скачает его, только когда встретит код
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "cyrillic"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Платформа",
  description: "Курсы, лабораторные и экзамены",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${onest.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
