import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fromId, hashId } from "./typo";

/**
 * Бумажные предметы (раздел 5): штамп и датер, круглая печать, галочка красным карандашом,
 * росчерк ручкой, стикер, малярный скотч. На бумаге значков нет — только рука и печать.
 * filter и mix-blend-mode разрешены только у штампа, печати, скотча и маркера.
 * Маски краски и графита — растровые файлы из public/textures (scripts/textures.mjs).
 */

/* ---------- Штемпельная краска: маска неравномерного оттиска ---------- */

function inkMask(id: string): CSSProperties {
  const h = hashId(id);
  const pos = `${-(h % 380)}px ${-((h >>> 9) % 380)}px`;
  return { WebkitMaskPosition: pos, maskPosition: pos };
}

/**
 * Рамка штампа: четыре резиновые кромки разной толщины (1,6–2,7 px), каждая с лёгким клином.
 * Ровная 2-пиксельная рамка читается как SVG, а не как оттиск.
 */
function StampFrame({ id }: { id: string }) {
  const t = (salt: number) => fromId(id, 1.6, 2.7, salt);
  const [a, b, c, d, e, f, g, h] = [1, 2, 3, 4, 5, 6, 7, 8].map(t);
  const bar = "pointer-events-none absolute bg-current";
  return (
    <>
      <span aria-hidden className={cn(bar, "inset-x-0 top-0 h-[3px]")} style={{ clipPath: `polygon(0 0, 100% 0, 100% ${b}px, 0 ${a}px)` }} />
      <span aria-hidden className={cn(bar, "inset-y-0 right-0 w-[3px]")} style={{ clipPath: `polygon(${3 - c}px 0, 100% 0, 100% 100%, ${3 - d}px 100%)` }} />
      <span aria-hidden className={cn(bar, "inset-x-0 bottom-0 h-[3px]")} style={{ clipPath: `polygon(0 ${3 - e}px, 100% ${3 - f}px, 100% 100%, 0 100%)` }} />
      <span aria-hidden className={cn(bar, "inset-y-0 left-0 w-[3px]")} style={{ clipPath: `polygon(0 0, ${g}px 0, ${h}px 100%, 0 100%)` }} />
    </>
  );
}

export interface StampProps {
  /** Детерминированные поворот (−4…+3°), кромки рамки и пятна краски */
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

/**
 * Прямоугольный штамп: резиновая рамка и текст гротеском Golos 600 капсом, +0.04em, цвет --seal.
 * Так режут настоящие ведомственные штампы; антиква на штампе читалась бы как набор в Word.
 */
export function Stamp({ id, children, rotate, animate = false, delay = 0, className, style }: StampProps) {
  const rot = rotate ?? fromId(id, -4, 3);
  return (
    <span
      className={cn(
        "relative inline-flex flex-col items-center justify-center px-3.5 py-1.5 text-center font-sans font-semibold uppercase tracking-[0.04em] text-seal ink-stamp",
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
      <StampFrame id={id} />
      {children}
    </span>
  );
}

/** Оттиск датера в «Отметках о сверке»: 220×40. Лента с датой сидит на полпикселя ниже надписи */
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
  const band = [date, time].filter(Boolean).join(" ");
  return (
    <Stamp
      id={id}
      animate={animate}
      className={cn("h-10 w-[220px] gap-0.5 px-2 py-0 text-[11px] leading-[14px] whitespace-pre", className)}
    >
      <span>
        {`Сверка ${attempt}`}
        {band && (
          <span className="relative" style={{ top: `${fromId(id, 0.5, 1, 3)}px` }}>
            {`   ${band}`}
          </span>
        )}
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
  // Кольца чуть неровные: резина печати давит сильнее с одного края
  const w1 = fromId(id, 1.9, 2.6, 1);
  const w2 = fromId(id, 0.8, 1.2, 2);
  return (
    <span
      className={cn("inline-block size-28 text-seal ink-stamp", className)}
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
        <circle cx="56" cy="56" r="53" fill="none" stroke="currentColor" strokeWidth={w1} />
        <circle cx="56.3" cy="55.8" r="36" fill="none" stroke="currentColor" strokeWidth={w2} />
        <text
          fill="currentColor"
          style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 9.2, letterSpacing: "0.04em" }}
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
          style={{ fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: 7.2, letterSpacing: "0.04em" }}
        >
          {center.toUpperCase()}
        </text>
      </svg>
    </span>
  );
}

/* ---------- Рука: штрих переменной толщины ----------
 * Карандаш и ручка рисуются не обводкой, а залитым контуром вокруг осевой линии:
 * тонкий вход, тяжёлое «брюхо», сброшенный хвост. Появление — маской по осевой
 * (stroke-dashoffset), поэтому штрих «пишется», а не проявляется. */

type Pt = [x: number, y: number, w: number];

/** Катмулл — Ром через точки с толщиной; на выходе — частые точки осевой */
function spline(points: Pt[], steps = 10): Pt[] {
  const out: Pt[] = [];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1), p1[2] + (p2[2] - p1[2]) * t]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const f1 = (n: number) => n.toFixed(2);

/** Залитый контур вокруг осевой: смещение по нормали на половину толщины */
function outlineOf(pts: Pt[]): string {
  const left: string[] = [];
  const right: string[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const h = p[2] / 2;
    left.push(`${f1(p[0] + nx * h)} ${f1(p[1] + ny * h)}`);
    right.push(`${f1(p[0] - nx * h)} ${f1(p[1] - ny * h)}`);
  });
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}

const centerOf = (pts: Pt[]) => `M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(" L")}`;

interface InkStroke {
  shape: string;
  center: string;
  /** Доля общего времени росчерка: [начало, длительность] */
  span: [number, number];
}

function strokes(list: Array<{ pts: Pt[]; span: [number, number] }>): InkStroke[] {
  return list.map(({ pts, span }) => {
    const line = spline(pts);
    return { shape: outlineOf(line), center: centerOf(line), span };
  });
}

/** Штрихи рисуются по очереди: маска по осевой каждого штриха */
function InkStrokes({
  list,
  duration,
  delay,
  animate,
  easing,
}: {
  list: InkStroke[];
  duration: number;
  delay: number;
  animate: boolean;
  easing: string;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <>
      {list.map((s, i) => (
        <g key={i}>
          {animate && (
            <mask id={`${uid}-${i}`} maskUnits="userSpaceOnUse">
              <path
                d={s.center}
                pathLength={1}
                fill="none"
                stroke="#fff"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={
                  {
                    strokeDasharray: 1,
                    strokeDashoffset: 0,
                    "--len": 1,
                    animation: `zs-draw ${Math.round(duration * s.span[1])}ms ${easing} ${Math.round(delay + duration * s.span[0])}ms both`,
                  } as CSSProperties
                }
              />
            </mask>
          )}
          <path d={s.shape} fill="currentColor" mask={animate ? `url(#${uid}-${i})` : undefined} />
        </g>
      ))}
    </>
  );
}

/* ---------- Галочка красным карандашом: три разные руки ---------- */

const CHECKS: InkStroke[][] = [
  // Классическая: короткий нажим вниз, длинный уход вверх с броском
  strokes([
    {
      pts: [
        [3, 10.6, 0.5],
        [5.2, 12.6, 1.5],
        [7.4, 16.2, 2.6],
        [9.6, 12.8, 2.1],
        [14.6, 7, 1.5],
        [20.8, 2.2, 0.35],
      ],
      span: [0, 1],
    },
  ]),
  // Пологая, с крючком на входе и прямым хвостом
  strokes([
    {
      pts: [
        [2.2, 8.4, 0.4],
        [3.4, 9.2, 1.1],
        [5.6, 12.4, 1.9],
        [8, 15.8, 2.3],
        [10.4, 12.4, 1.8],
        [16, 7.8, 1.1],
        [22, 4.6, 0.3],
      ],
      span: [0, 1],
    },
  ]),
  // Крутая и короткая слева, хвост выгнут дугой и отброшен вправо
  strokes([
    {
      pts: [
        [4.6, 12.8, 0.6],
        [6.2, 15.4, 2.2],
        [7.2, 17.6, 2.8],
        [9, 13.8, 2.2],
        [12.4, 8.4, 1.6],
        [16.6, 4.2, 1],
        [20.2, 2.2, 0.55],
        [22.4, 2.6, 0.25],
      ],
      span: [0, 1],
    },
  ]),
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
  const list = CHECKS[hashId(id) % CHECKS.length];
  return (
    <svg
      viewBox="0 0 24 20"
      className={cn("h-5 w-6 text-red-pencil pencil-grain", className)}
      style={{ WebkitMaskPosition: `${-(hashId(id) % 100)}px 0`, maskPosition: `${-(hashId(id) % 100)}px 0` }}
      aria-hidden
    >
      <InkStrokes list={list} duration={180} delay={delay} animate={animate} easing="var(--ease-out)" />
    </svg>
  );
}

/* ---------- Подпись синей ручкой: «Н» и росчерк «оль», подчёркивание ---------- */

const SIGNATURE = strokes([
  // Левая ножка «Н»: нажим вниз
  {
    pts: [
      [14, 6.5, 0.5],
      [13, 13, 1.5],
      [11.6, 22, 2.1],
      [10.4, 30.5, 0.7],
    ],
    span: [0, 0.16],
  },
  // Перекладина, правая ножка, связка и «оль» одним движением
  {
    pts: [
      [9.4, 21.4, 0.4],
      [15.4, 19.6, 0.8],
      [21.4, 17.8, 0.7],
      [24.6, 8.6, 0.55],
      [25.4, 6, 0.45],
      [24.4, 14, 1.7],
      [22.8, 24, 2.2],
      [21.8, 30, 1.3],
      [25.6, 26.4, 0.6],
      [30, 21.4, 0.7],
      [33.8, 19.6, 1.2],
      [36.4, 22.6, 1.6],
      [34.6, 26.6, 1.3],
      [30.8, 26, 0.8],
      [31.4, 22, 0.6],
      [35.6, 21.4, 0.6],
      [38.6, 27, 1],
      [41.6, 20.8, 0.8],
      [44.6, 19.4, 0.8],
      [45.6, 24.6, 1.7],
      [46.6, 29.6, 1.3],
      [49.6, 22.4, 0.6],
      [50.4, 27.6, 1.5],
      [49.2, 30.2, 1],
      [53.4, 28.6, 0.9],
      [55.4, 25.8, 0.7],
      [52.8, 24.6, 0.5],
    ],
    span: [0.14, 0.62],
  },
  // Подчёркивание-росчерк: из-под первой буквы далеко вправо, с подъёмом и сбросом
  {
    pts: [
      [5, 35.4, 0.35],
      [22, 34.6, 1.3],
      [48, 33.2, 1.8],
      [80, 31, 1.4],
      [104, 28.2, 0.8],
      [121, 24.6, 0.3],
    ],
    span: [0.74, 0.26],
  },
]);

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
      <InkStrokes list={SIGNATURE} duration={400} delay={delay} animate={animate} easing="var(--ease-in-out)" />
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
