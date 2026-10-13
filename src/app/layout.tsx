import type { Metadata, Viewport } from "next";
import { Bad_Script, Golos_Text, PT_Mono, PT_Serif } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VisibilityPause } from "@/components/kit/visibility-pause";
import "./globals.css";

/**
 * Четыре семейства, у каждого одна роль:
 * система говорит Golos, данные пишутся PT Mono, люди и бумага — PT Serif, рука — Bad Script.
 */
const ui = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
});
const data = PT_Mono({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-data",
  display: "swap",
});
const doc = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-doc",
  display: "swap",
});
const hand = Bad_Script({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZeroSQL",
  description:
    "Детектив на SQL. Полярная ночь, город, который греет дата-центр, и полынья, которая не замерзает.",
};

export const viewport: Viewport = {
  themeColor: "#0A0C0D",
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
      className={`${ui.variable} ${data.variable} ${doc.variable} ${hand.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <VisibilityPause />
        <TooltipProvider delay={500}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
