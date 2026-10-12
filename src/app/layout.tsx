import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/** Заголовки, логотип, штампы — широкий характерный гротеск */
const display = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
});

/** Основной текст: диалоги, интерфейс */
const body = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
});

/** SQL, таблицы, числа */
const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZeroSQL — Детективная игра на SQL",
  description:
    "Полярная ночь, город, который греет дата-центр, и полынья, которая не замерзает. Ты — аналитик по прозвищу Ноль. Расследуй дела SQL-запросами.",
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${display.variable} ${body.variable} ${mono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
