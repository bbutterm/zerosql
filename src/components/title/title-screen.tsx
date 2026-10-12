"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ChevronRight, Headphones, Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GrainLayer } from "@/components/kit/atmosphere";

export interface TitleMenuAction {
  /** Ссылка (next/link) или колбэк */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Мелкая подпись справа: «Дело № 01 · 3/5» */
  meta?: string;
}

export interface TitleScreenProps {
  /** Слот подзаголовка под логотипом */
  subtitle?: ReactNode;
  newGame?: TitleMenuAction;
  continueGame?: TitleMenuAction;
  archive?: TitleMenuAction;
  /** Подпись версии в подвале */
  version?: string;
  /** Подвал справа — по умолчанию «играть в наушниках · 18+» */
  footer?: ReactNode;
  className?: string;
}

/* ---------- Детерминированный «случай» для звёзд и города (одинаково на сервере и клиенте) ---------- */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(2027);
const round = (n: number) => Math.round(n * 10) / 10;

const STARS = Array.from({ length: 110 }, () => ({
  x: round(rnd() * 1600),
  y: round(rnd() * 470),
  r: round(0.35 + rnd() * 1.05),
  o: round(0.25 + rnd() * 0.6),
  twinkle: rnd() < 0.18,
  delay: round(rnd() * 6),
}));

const CURTAIN = Array.from({ length: 46 }, (_, i) => ({
  x: round(-40 + i * 36 + rnd() * 18),
  w: round(5 + rnd() * 12),
  h: round(90 + rnd() * 170),
  o: round(0.08 + rnd() * 0.16),
}));

interface Building {
  x: number;
  w: number;
  h: number;
  windows: Array<{ x: number; y: number }>;
}

const BASE_Y = 600;
const BUILDINGS: Building[] = (() => {
  const out: Building[] = [];
  let x = 230;
  while (x < 1390) {
    const w = round(16 + rnd() * 46);
    // Ниже у краёв, выше к центру
    const centrality = 1 - Math.abs(x - 820) / 620;
    const h = round(14 + rnd() * 50 + centrality * 60);
    const windows: Array<{ x: number; y: number }> = [];
    for (let wy = BASE_Y - h + 6; wy < BASE_Y - 6; wy += 7) {
      for (let wx = x + 4; wx < x + w - 4; wx += 6) {
        if (rnd() < 0.13) windows.push({ x: round(wx), y: round(wy) });
      }
    }
    if (x < 690 || x > 1000) out.push({ x: round(x), w, h, windows });
    x += w + round(rnd() * 6);
  }
  return out;
})();

const SHORE_LIGHTS = Array.from({ length: 16 }, (_, i) => ({
  x: round(330 + i * 62 + rnd() * 20),
  y: round(BASE_Y + 5 + rnd() * 4),
}));

const STEAM_DC = [
  { cx: 752, cy: 410, rx: 46, ry: 40, delay: "0s", dur: "12s" },
  { cx: 812, cy: 380, rx: 60, ry: 52, delay: "-5s", dur: "14s" },
  { cx: 872, cy: 400, rx: 52, ry: 44, delay: "-9s", dur: "13s" },
  { cx: 800, cy: 320, rx: 90, ry: 60, delay: "-3s", dur: "16s" },
];

const STEAM_WATER = [
  { cx: 640, cy: 740, rx: 120, ry: 46, delay: "0s", dur: "11s" },
  { cx: 800, cy: 730, rx: 150, ry: 54, delay: "-4s", dur: "13s" },
  { cx: 960, cy: 745, rx: 120, ry: 44, delay: "-7s", dur: "12s" },
  { cx: 740, cy: 690, rx: 110, ry: 40, delay: "-2s", dur: "14s" },
  { cx: 900, cy: 680, rx: 130, ry: 42, delay: "-9s", dur: "15s" },
];

const POLYNYA =
  "M498 776 C506 742 548 722 604 712 C640 706 668 712 702 700 C744 688 790 698 830 694 C884 690 918 704 968 702 C1030 700 1084 716 1110 742 C1132 764 1128 790 1104 806 C1080 824 1040 828 1010 842 C968 860 912 872 850 868 C790 864 742 874 690 862 C632 850 584 846 548 826 C514 808 492 796 498 776 Z";

/** Отражения фонарей на воде: разной ширины и яркости */
const REFLECTIONS = Array.from({ length: 11 }, (_, i) => ({
  x: round(540 + i * 52 + rnd() * 26),
  w: round(3 + rnd() * 6),
  h: round(90 + rnd() * 90),
  o: round(0.3 + rnd() * 0.45),
  teal: i === 5 || i === 6,
}));

const SNOW_DRIFTS = [
  { cx: 220, cy: 700, rx: 260, ry: 26 },
  { cx: 1340, cy: 690, rx: 300, ry: 22 },
  { cx: 380, cy: 860, rx: 340, ry: 40 },
  { cx: 1260, cy: 880, rx: 380, ry: 46 },
  { cx: 820, cy: 640, rx: 420, ry: 14 },
];

const CRACKS = [
  "M514 772 L446 786 L392 778 L318 812 L214 826 L120 862 L20 878",
  "M392 778 L360 742 L300 728 L212 734",
  "M600 852 L560 880 L500 900",
  "M1116 778 L1190 790 L1262 778 L1340 806 L1452 812 L1600 846",
  "M1262 778 L1296 742 L1380 728",
  "M1010 862 L1058 900",
  "M806 694 L812 662 L796 640",
  "M318 812 L292 852 L240 900",
];

export function TitleScreen({
  subtitle,
  newGame,
  continueGame,
  archive,
  version = "v2 · предрелиз",
  footer,
  className,
}: TitleScreenProps) {
  return (
    <div
      className={cn(
        "relative isolate flex h-dvh min-h-[560px] w-full flex-col overflow-hidden bg-[#02040a] text-steam",
        className
      )}
    >
      <PolarScene />

      {/* Подложка для читаемости меню */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(2_4_10/0.82)_0%,rgb(2_4_10/0.45)_38%,transparent_62%)] max-md:bg-[linear-gradient(180deg,rgb(2_4_10/0.6)_0%,rgb(2_4_10/0.2)_30%,transparent_42%,transparent_62%,#0b1124_73%,#070b18_100%)]"
      />
      <GrainLayer opacity={0.06} />

      <div className="relative z-10 flex flex-1 flex-col justify-between gap-8 px-6 pt-10 pb-6 sm:px-12 sm:pt-14 md:justify-center md:gap-12 lg:px-20">
        <div className="max-w-xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-1000">
          <p className="mb-4 font-display text-[10px] tracking-[0.42em] text-aurora/80 uppercase sm:text-[11px]">
            Полярная ночь · 2026
          </p>
          <h1 className="font-display text-[clamp(3rem,9vw,7.25rem)] leading-[0.92] font-black tracking-[-0.03em]">
            <span className="text-steam [text-shadow:0_0_40px_rgb(238_243_250/0.18)]">Zero</span>
            <span className="bg-gradient-to-br from-aurora via-aurora to-aurora-violet bg-clip-text text-transparent [filter:drop-shadow(0_0_22px_rgb(46_230_197/0.35))]">
              SQL
            </span>
          </h1>
          <div className="mt-5 max-w-md text-[15px] leading-relaxed text-frost sm:text-base">
            {subtitle ?? (
              <p>
                Город греет дата-центр. Полынья в заливе не замерзает даже в минус сорок. Вы — аналитик по прозвищу
                Ноль, и у вас есть зеркало всех городских данных.
              </p>
            )}
          </div>
        </div>

        <nav aria-label="Главное меню" className="flex max-w-sm flex-col gap-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-1000 motion-safe:delay-300 motion-safe:fill-mode-both">
          <MenuItem action={newGame} primary icon={<Plus />}>
            Новое расследование
          </MenuItem>
          <MenuItem action={continueGame} icon={<Play />}>
            Продолжить
          </MenuItem>
          <MenuItem action={archive} icon={<Archive />}>
            Архив
          </MenuItem>
        </nav>
      </div>

      <footer className="relative z-10 flex items-center justify-between gap-4 px-6 pb-5 text-[11px] text-frost-dim sm:px-12 lg:px-20">
        <span className="font-mono">{version}</span>
        {footer ?? (
          <span className="inline-flex items-center gap-3">
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <Headphones className="size-3.5" aria-hidden />
              лучше в наушниках
            </span>
            <span className="rounded-sm border border-frost-line-strong px-1.5 py-0.5 font-display text-[10px] font-semibold text-frost">
              18+
            </span>
          </span>
        )}
      </footer>
    </div>
  );
}

function MenuItem({
  action,
  primary = false,
  icon,
  children,
}: {
  action?: TitleMenuAction;
  primary?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const disabled = !action || action.disabled || (!action.href && !action.onClick);
  const className = cn(
    "group/menu relative flex items-center gap-3.5 rounded-md py-2.5 pr-3 pl-4 text-left transition-[background-color,color,transform] duration-300",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    disabled
      ? "cursor-not-allowed text-frost-dim/60"
      : primary
        ? "text-steam hover:translate-x-1 hover:bg-sodium/[0.08] focus-visible:translate-x-1"
        : "text-frost hover:translate-x-1 hover:bg-steam/[0.05] hover:text-steam focus-visible:translate-x-1"
  );
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 h-0 w-[3px] -translate-y-1/2 rounded-full transition-[height] duration-300",
          primary ? "h-5 bg-sodium shadow-[0_0_14px_var(--sodium)]" : "bg-aurora",
          !disabled && "group-hover/menu:h-7 group-focus-visible/menu:h-7"
        )}
      />
      <span className={cn(primary && !disabled ? "text-sodium" : "text-frost-dim group-hover/menu:text-aurora")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-display tracking-wide text-balance",
            primary ? "text-base font-semibold sm:text-lg" : "text-[15px] font-medium sm:text-base"
          )}
        >
          {children}
        </span>
        {action?.meta && <span className="mt-0.5 block truncate text-xs text-frost-dim">{action.meta}</span>}
      </span>
      {!disabled && (
        <ChevronRight
          aria-hidden
          className="opacity-0 transition-[opacity,transform] duration-300 group-hover/menu:translate-x-0.5 group-hover/menu:opacity-100"
        />
      )}
    </>
  );

  if (!disabled && action?.href) {
    return (
      <Link href={action.href} className={className} onClick={action.onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={action?.onClick} disabled={disabled}>
      {content}
    </button>
  );
}

/* ---------- Сцена: сияние, город с дата-центром, лёд и полынья ---------- */

const anim = (delay: string, duration: string): CSSProperties => ({
  animationDelay: delay,
  animationDuration: duration,
});

function PolarScene() {
  const prefix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const u = (name: string) => `${prefix}-${name}`;
  return (
    <svg
      aria-hidden
      className="absolute inset-x-0 top-[-14%] -z-10 h-[88%] w-full md:inset-0 md:h-full"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={u("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#02040a" />
          <stop offset="0.45" stopColor="#081026" />
          <stop offset="0.66" stopColor="#121b3a" />
        </linearGradient>
        <linearGradient id={u("aurora-a")} x1="0" y1="120" x2="0" y2="380" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset="0.35" stopColor="#8b5cf6" stopOpacity="0.32" />
          <stop offset="0.8" stopColor="#2ee6c5" stopOpacity="0.6" />
          <stop offset="1" stopColor="#2ee6c5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u("aurora-b")} x1="0" y1="40" x2="0" y2="230" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
          <stop offset="0.6" stopColor="#8b5cf6" stopOpacity="0.4" />
          <stop offset="0.95" stopColor="#2ee6c5" stopOpacity="0.3" />
          <stop offset="1" stopColor="#2ee6c5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u("ray")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2ee6c5" stopOpacity="0" />
          <stop offset="1" stopColor="#2ee6c5" stopOpacity="1" />
        </linearGradient>
        <linearGradient id={u("ice")} x1="0" y1="600" x2="0" y2="900" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0c1328" />
          <stop offset="0.5" stopColor="#141d38" />
          <stop offset="1" stopColor="#1c2747" />
        </linearGradient>
        <radialGradient id={u("water")} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#050912" />
          <stop offset="1" stopColor="#010205" />
        </radialGradient>
        <linearGradient id={u("reflect-amber")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb547" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u("reflect-teal")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2ee6c5" stopOpacity="0.6" />
          <stop offset="1" stopColor="#2ee6c5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u("water-sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.14" />
          <stop offset="0.5" stopColor="#2ee6c5" stopOpacity="0.08" />
          <stop offset="1" stopColor="#2ee6c5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={u("rim")} x1="0" y1="690" x2="0" y2="872" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e6eef8" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#bccbe0" stopOpacity="0.18" />
          <stop offset="1" stopColor="#bccbe0" stopOpacity="0.06" />
        </linearGradient>
        <pattern id={u("ripple-lines")} width="1600" height="6" patternUnits="userSpaceOnUse">
          <rect width="1600" height="3.2" fill="#fff" />
        </pattern>
        <mask id={u("ripples")} maskUnits="userSpaceOnUse" x="0" y="600" width="1600" height="300">
          <rect x="0" y="600" width="1600" height="300" fill={`url(#${u("ripple-lines")})`} />
        </mask>
        <filter id={u("blur-xl")} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id={u("blur-l")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id={u("blur-s")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <radialGradient id={u("vignette")} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.6" stopColor="#02040a" stopOpacity="0" />
          <stop offset="1" stopColor="#02040a" stopOpacity="0.75" />
        </radialGradient>
        <clipPath id={u("polynya")}>
          <path d={POLYNYA} />
        </clipPath>
      </defs>

      {/* Небо */}
      <rect width="1600" height="900" fill={`url(#${u("sky")})`} />

      {/* Звёзды */}
      <g fill="#eef3fa">
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            opacity={s.o}
            className={s.twinkle ? "motion-safe:animate-twinkle" : undefined}
            style={s.twinkle ? { animationDelay: `${s.delay}s` } : undefined}
          />
        ))}
      </g>

      {/* Полярное сияние */}
      <g filter={`url(#${u("blur-xl")})`}>
        <g className="origin-center [transform-box:fill-box] motion-safe:animate-aurora-drift">
          <path
            d="M-100 270 C200 150 500 310 800 210 S1300 130 1700 240 L1700 350 C1300 240 1100 350 800 320 S200 280 -100 380 Z"
            fill={`url(#${u("aurora-a")})`}
          />
        </g>
        <g
          className="origin-center [transform-box:fill-box] motion-safe:animate-aurora-drift"
          style={anim("-9s", "28s")}
        >
          <path
            d="M-100 170 C300 70 700 210 1000 120 S1500 70 1700 130 L1700 200 C1450 140 1250 210 1000 190 S400 170 -100 240 Z"
            fill={`url(#${u("aurora-b")})`}
          />
        </g>
      </g>
      <g filter={`url(#${u("blur-l")})`} className="mix-blend-screen">
        {CURTAIN.map((c, i) => {
          const baseY = 300 + Math.sin(i / 4.2) * 50 - (i > 22 ? (i - 22) * 2 : 0);
          return (
            <rect key={i} x={c.x} y={baseY - c.h} width={c.w} height={c.h} fill={`url(#${u("ray")})`} opacity={c.o} />
          );
        })}
      </g>

      {/* Сопки за городом */}
      <path
        d="M0 586 C120 560 220 572 320 556 C430 540 520 566 640 560 C760 552 860 570 980 556 C1100 544 1220 566 1340 552 C1440 542 1520 560 1600 556 L1600 610 L0 610 Z"
        fill="#0a1022"
      />

      {/* Пар над дата-центром */}
      <g filter={`url(#${u("blur-l")})`}>
        {STEAM_DC.map((p, i) => (
          <ellipse
            key={i}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            fill="#eef3fa"
            fillOpacity="0.16"
            className="origin-center [transform-box:fill-box] motion-safe:animate-steam-rise"
            style={anim(p.delay, p.dur)}
          />
        ))}
      </g>

      {/* Город */}
      <g fill="#060a16">
        {BUILDINGS.map((b, i) => (
          <rect key={i} x={b.x} y={BASE_Y - b.h} width={b.w} height={b.h} />
        ))}
      </g>
      <g fill="#ffb547">
        {BUILDINGS.flatMap((b, i) =>
          b.windows.map((w, j) => <rect key={`${i}-${j}`} x={w.x} y={w.y} width="2" height="2.4" opacity="0.7" />)
        )}
      </g>

      {/* Дата-центр с трубами охлаждения */}
      <g>
        <rect x="700" y="508" width="290" height="92" fill="#070c1a" />
        <rect x="740" y="452" width="20" height="58" fill="#070c1a" />
        <rect x="800" y="430" width="24" height="80" fill="#070c1a" />
        <rect x="862" y="448" width="20" height="62" fill="#070c1a" />
        <rect x="930" y="486" width="44" height="24" fill="#070c1a" />
        <rect x="700" y="560" width="290" height="2" fill="#2ee6c5" opacity="0.75" />
        <rect x="700" y="574" width="290" height="1.5" fill="#2ee6c5" opacity="0.35" />
        <rect x="690" y="548" width="310" height="40" fill="#2ee6c5" opacity="0.08" filter={`url(#${u("blur-l")})`} />
        {Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={712 + i * 12.6} y="530" width="5" height="2" fill="#2ee6c5" opacity={i % 3 === 0 ? 0.9 : 0.35} />
        ))}
      </g>

      {/* Мачта с сигнальным огнём */}
      <g>
        <path d="M1188 600 L1196 470 L1204 600 Z" fill="#060a16" />
        <circle cx="1196" cy="468" r="2.6" fill="#ff6a2b" className="motion-safe:animate-twinkle" style={anim("0s", "2.4s")} />
        <circle cx="1196" cy="468" r="9" fill="#ff6a2b" opacity="0.25" filter={`url(#${u("blur-s")})`} />
      </g>

      {/* Лёд */}
      <rect y="600" width="1600" height="300" fill={`url(#${u("ice")})`} />
      <ellipse cx="800" cy="640" rx="620" ry="40" fill="#2ee6c5" opacity="0.05" filter={`url(#${u("blur-xl")})`} />
      <g fill="#2a3a60" filter={`url(#${u("blur-l")})`}>
        {SNOW_DRIFTS.map((d, i) => (
          <ellipse key={i} cx={d.cx} cy={d.cy} rx={d.rx} ry={d.ry} opacity="0.45" />
        ))}
      </g>

      {/* Фонари набережной */}
      <g>
        {SHORE_LIGHTS.map((l, i) => (
          <g key={i}>
            <circle cx={l.x} cy={l.y} r="7" fill="#ffb547" opacity="0.28" filter={`url(#${u("blur-s")})`} />
            <circle cx={l.x} cy={l.y} r="1.5" fill="#ffd79a" />
          </g>
        ))}
      </g>

      {/* Трещины во льду */}
      <g fill="none" strokeLinejoin="round">
        <g stroke="#2ee6c5" strokeOpacity="0.18" strokeWidth="4" filter={`url(#${u("blur-s")})`}>
          {CRACKS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g stroke="#bccbe0" strokeOpacity="0.4" strokeWidth="1.2">
          {CRACKS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </g>

      {/* Полынья: чёрная вода с отражениями */}
      <g transform="translate(0 112) scale(1 0.86)">
      <path d={POLYNYA} fill="#2ee6c5" opacity="0.06" filter={`url(#${u("blur-l")})`} />
      <path d={POLYNYA} fill={`url(#${u("water")})`} />
      <g clipPath={`url(#${u("polynya")})`}>
        <rect x="480" y="690" width="660" height="80" fill={`url(#${u("water-sky")})`} />
        <g mask={`url(#${u("ripples")})`} filter={`url(#${u("blur-s")})`}>
          {REFLECTIONS.map((r, i) => (
            <rect
              key={i}
              x={r.x}
              y="696"
              width={r.w}
              height={r.h}
              fill={r.teal ? `url(#${u("reflect-teal")})` : `url(#${u("reflect-amber")})`}
              fillOpacity={r.o}
              className="origin-top [transform-box:fill-box] motion-safe:animate-ripple"
              style={anim(`${-i * 0.7}s`, `${5 + (i % 3)}s`)}
            />
          ))}
        </g>
      </g>
      <g clipPath={`url(#${u("polynya")})`}>
        <path d={POLYNYA} fill="none" stroke="#000" strokeOpacity="0.7" strokeWidth="18" filter={`url(#${u("blur-l")})`} />
      </g>
      <path d={POLYNYA} fill="none" stroke={`url(#${u("rim")})`} strokeWidth="1.4" />
      </g>

      {/* Пар над водой */}
      <g filter={`url(#${u("blur-xl")})`}>
        {STEAM_WATER.map((p, i) => (
          <ellipse
            key={i}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            fill="#eef3fa"
            fillOpacity="0.22"
            className="origin-center [transform-box:fill-box] motion-safe:animate-steam-rise"
            style={anim(p.delay, p.dur)}
          />
        ))}
      </g>

      {/* Виньетка */}
      <rect width="1600" height="900" fill={`url(#${u("vignette")})`} />
    </svg>
  );
}
