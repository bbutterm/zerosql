import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fromId, hashId } from "./typo";

/**
 * Бумажные предметы (раздел 5): штамп и датер, круглая печать, галочка красным карандашом,
 * росчерк ручкой, стикер, малярный скотч. На бумаге значков нет — только рука и печать.
 * filter и mix-blend-mode разрешены только у штампа, печати, скотча и маркера.
 */

/* ---------- Штемпельная краска: маска неравномерного оттиска ---------- */

function inkMask(id: string): CSSProperties {
  const h = hashId(id);
  return {
    WebkitMaskImage: "url(/textures/stamp-mask.png)",
    maskImage: "url(/textures/stamp-mask.png)",
    WebkitMaskSize: "512px",
    maskSize: "512px",
    WebkitMaskPosition: `${-(h % 380)}px ${-((h >>> 9) % 380)}px`,
    maskPosition: `${-(h % 380)}px ${-((h >>> 9) % 380)}px`,
    mixBlendMode: "multiply",
  };
}

export interface StampProps {
  /** Детерминированные поворот (−4…+3°) и пятна краски */
  id: string;
  children: ReactNode;
  /** Явный поворот, градусы */
  rotate?: number;
  /** Проиграть удар (70 мс + впитывание 200 мс) */
  animate?: boolean;
  /** Задержка удара, мс */
  delay?: number;
  className?: string;
  style?: CSSProperties;
}

/** Прямоугольный штамп: рамка 2 px и текст PT Serif 700 капсом, +0.06em, цвет --seal */
export function Stamp({ id, children, rotate, animate = false, delay = 0, className, style }: StampProps) {
  const rot = rotate ?? fromId(id, -4, 3);
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center border-2 border-seal px-3 py-1 text-center font-serif font-bold uppercase tracking-[0.06em] text-seal",
        className
      )}
      style={
        {
          ...inkMask(id),
          "--stamp-rot": `${rot}deg`,
          transform: `rotate(${rot}deg)`,
          opacity: 0.88,
          animation: animate ? `zs-stamp 270ms ${delay}ms both` : undefined,
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}

/** Оттиск датера в «Отметках о сверке»: 220×40, одна строка */
export function DaterStamp({
  id,
  attempt,
  date,
  time,
  matched,
  total,
  animate,
  className,
}: {
  id: string;
  attempt: number;
  date?: string;
  time?: string;
  matched: number;
  total: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <Stamp
      id={id}
      animate={animate}
      className={cn("h-10 w-[220px] gap-0.5 px-2 py-0 text-[11px] leading-[14px] whitespace-pre", className)}
    >
      <span>
        {`Сверка ${attempt}`}
        {(date || time) && `   ${[date, time].filter(Boolean).join(" ")}`}
      </span>
      <span>{`Совпало ${matched} из ${total}`}</span>
    </Stamp>
  );
}

/** Круглая печать: 112 px, текст по окружности, звезда в центре. Орган вымышленный */
export function RoundSeal({
  id,
  text = "Управление внутренних дел — отдел аналитики —",
  center = "Для пакетов",
  animate = false,
  delay = 0,
  className,
}: {
  id: string;
  text?: string;
  center?: string;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  const rot = fromId(id, -18, 14);
  const pathId = `seal-${hashId(id).toString(36)}`;
  // Пятиконечная звезда r=11 в центре
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 11 : 4.6;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(56 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <span
      className={cn("inline-block size-28 text-seal", className)}
      style={
        {
          ...inkMask(`${id}-seal`),
          "--stamp-rot": `${rot}deg`,
          transform: `rotate(${rot}deg)`,
          opacity: 0.88,
          animation: animate ? `zs-stamp 270ms ${delay}ms both` : undefined,
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 112 112" className="size-full" aria-hidden>
        <defs>
          <path id={pathId} d="M56 56 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" />
        </defs>
        <circle cx="56" cy="56" r="53" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="56" cy="56" r="36" fill="none" stroke="currentColor" strokeWidth="1" />
        <text
          fill="currentColor"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 9.6, letterSpacing: "0.06em" }}
        >
          <textPath href={`#${pathId}`} startOffset="0" textLength="272" lengthAdjust="spacingAndGlyphs">
            {text.toUpperCase()}
          </textPath>
        </text>
        <polygon points={star} fill="currentColor" />
        <text
          x="56"
          y="74"
          textAnchor="middle"
          fill="currentColor"
          style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: 7.5, letterSpacing: "0.06em" }}
        >
          {center.toUpperCase()}
        </text>
      </svg>
    </span>
  );
}

/* ---------- Красный карандаш и шариковая ручка ---------- */

// Три нарисованных от руки варианта галочки: неровный путь, а не фильтр
const CHECKS = [
  "M3.2 11.6 C4.6 12.4 6.1 14.2 7.4 16.3 C7.8 16.9 8.3 16.8 8.6 16.1 C10.9 10.8 14.6 6.2 20.6 2.4",
  "M2.6 10.4 C4.4 11.2 5.8 13.1 7.1 15.6 C7.5 16.4 8.1 16.2 8.4 15.5 C10.2 11.4 13.9 6.4 21.1 3.1",
  "M3.6 12.2 C5 12.6 6.3 14.1 7.6 16.6 C8 17.2 8.6 17 8.9 16.2 C11.6 10.1 15.2 5.9 20.2 2.9",
];

export function PencilCheck({
  id,
  animate = false,
  delay = 0,
  className,
}: {
  id: string;
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  const d = CHECKS[hashId(id) % CHECKS.length];
  return (
    <svg viewBox="0 0 24 20" className={cn("h-5 w-6 text-red-pencil", className)} aria-hidden>
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          {
            strokeDasharray: 1,
            strokeDashoffset: 0,
            "--len": 1,
            animation: animate ? `zs-draw 180ms var(--ease-out) ${delay}ms both` : undefined,
          } as CSSProperties
        }
      />
    </svg>
  );
}

/** Росчерк подписи синей ручкой; рисуется за 400 мс */
export function Signature({
  animate = false,
  delay = 0,
  className,
}: {
  animate?: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 128 40" className={cn("h-10 w-32 text-pen", className)} aria-hidden>
      <path
        d="M6 27 C10 15 15 9 18 11 C21 13 15 29 17 30 C20 31 24 14 28 15 C31 16 27 28 31 28 C35 28 38 18 42 19 C45 20 42 27 46 27 C52 27 56 12 62 13 C66 14 60 30 66 29 C74 28 80 17 90 19 C97 20 92 27 99 26 C107 25 114 20 122 18"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          {
            strokeDasharray: 1,
            strokeDashoffset: 0,
            "--len": 1,
            animation: animate ? `zs-draw 400ms var(--ease-in-out) ${delay}ms both` : undefined,
          } as CSSProperties
        }
      />
    </svg>
  );
}

/* ---------- Стикер и скотч ---------- */

/** Стикер рукой предшественницы: Bad Script, графит, до 12 слов. Поворот по id, до ±3° */
export function StickyNote({
  id,
  children,
  size = 120,
  rotate,
  className,
  style,
}: {
  id: string;
  children: ReactNode;
  size?: number;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const rot = rotate ?? fromId(id, -3, 3);
  const long = typeof children === "string" && children.length > 26;
  return (
    <div
      className={cn(
        "flex shrink-0 items-start overflow-hidden bg-sticky p-3 font-script text-pencil shadow-pinned",
        size >= 110 && !long ? "text-[20px] leading-[26px]" : "text-[18px] leading-[22px]",
        className
      )}
      style={{ width: size, height: size, transform: `rotate(${rot}deg)`, ...style }}
    >
      <p className="[text-wrap:balance]">{children}</p>
    </div>
  );
}

/** Полоска малярного скотча 48×16 с зубчатыми концами. Ставится по центру верхнего края */
export function Tape({ id, className, style }: { id: string; className?: string; style?: CSSProperties }) {
  const rot = fromId(id, -4, 4, 7);
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute block h-4 w-12 bg-tape", className)}
      style={{
        opacity: 0.82,
        transform: `rotate(${rot}deg)`,
        clipPath:
          "polygon(0 8%, 6% 0, 94% 0, 100% 12%, 96% 30%, 100% 50%, 95% 70%, 100% 90%, 94% 100%, 6% 100%, 0 88%, 4% 68%, 0 50%, 5% 32%)",
        ...style,
      }}
    />
  );
}
