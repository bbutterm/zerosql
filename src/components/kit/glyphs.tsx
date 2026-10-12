import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Свой набор глифов «Зеркала» (раздел 10): inline SVG, currentColor, обводка 1,5 px,
 * квадратные концы, сетка 12 px. Значок ставится только у управления без текста или у
 * состояния, которое нельзя сказать словом. В заголовках, меню, списках и на бумаге значков нет.
 *
 * В шрифтах игры нет ▸ ▾ ▶ ✓ ↵ — недостающие знаки рисуются здесь, а не набираются текстом.
 */

export type GlyphName =
  | "disclosure"
  | "disclosure-open"
  | "marker"
  | "check"
  | "next"
  | "close"
  | "speaker"
  | "speaker-off"
  | "play"
  | "pause"
  | "zero-mark";

type Shape = { d: string; fill?: boolean };

const SHAPES: Record<GlyphName, Shape[]> = {
  disclosure: [{ d: "M4.5 2.75 L8.25 6 L4.5 9.25 Z" }],
  "disclosure-open": [{ d: "M2.75 4.5 L9.25 4.5 L6 8.25 Z" }],
  marker: [{ d: "M3 2 L10 6 L3 10 Z", fill: true }],
  check: [{ d: "M1.75 6.25 L4.75 9.25 L10.25 3" }],
  next: [{ d: "M2.5 4 L9.5 4 L6 8.5 Z", fill: true }],
  close: [{ d: "M3 3 L9 9 M9 3 L3 9" }],
  speaker: [{ d: "M1.75 4.5 H3.75 L6.75 2 V10 L3.75 7.5 H1.75 Z" }, { d: "M8.75 4.25 Q9.9 6 8.75 7.75" }],
  "speaker-off": [{ d: "M1.75 4.5 H3.75 L6.75 2 V10 L3.75 7.5 H1.75 Z" }, { d: "M8.5 4.5 L11 7.5 M11 4.5 L8.5 7.5" }],
  play: [{ d: "M3.5 2.5 L9.5 6 L3.5 9.5 Z", fill: true }],
  pause: [{ d: "M4 2.5 V9.5 M8 2.5 V9.5" }],
  // Ноль-полынья: эллипс с разрывом справа сверху — вода, которая не замерзает
  "zero-mark": [{ d: "M8.81 3.5 A3.25 5 0 1 1 7.53 1.59" }],
};

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: GlyphName;
  /** 10, 12 (база) или 16 px */
  size?: 10 | 12 | 16;
  /** Подпись для читалки экрана; без неё глиф декоративный */
  label?: string;
}

export function Glyph({ name, size = 12, label, className, ...rest }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
      className={cn("inline-block shrink-0", className)}
      {...rest}
    >
      {SHAPES[name].map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={s.fill ? "currentColor" : "none"}
          stroke={s.fill ? "none" : "currentColor"}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
