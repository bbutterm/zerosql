"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import type { CharacterDef, Emotion } from "@/types/story";
import { cn } from "@/lib/utils";
import {
  isMediaMissing,
  markMediaMissing,
  portraitUrl,
  useMediaCacheVersion,
} from "./media-cache";

export type PortraitSize = "dialogue" | "avatar" | "card";

export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: "спокойно",
  happy: "радость",
  sad: "грусть",
  angry: "гнев",
  scared: "страх",
  surprised: "удивление",
  smug: "ухмылка",
  thinking: "раздумье",
  tired: "усталость",
  hurt: "боль",
};

export interface PortraitFrameProps {
  /** Персонаж; без него — «неизвестный» силуэт */
  character?: CharacterDef | null;
  emotion?: Emotion;
  /** dialogue — высокий 2:3, avatar — квадрат, card — досье 3:4 с табличкой */
  size?: PortraitSize;
  className?: string;
  /** Сейчас говорит — подсветка акцентным цветом */
  speaking?: boolean;
  /** Слушает — приглушить */
  dimmed?: boolean;
  /** Подпись эмоции на заглушке (по умолчанию: dialogue и card) */
  showEmotion?: boolean;
  /** Табличка с именем (по умолчанию: card) */
  showName?: boolean;
  /** Корень папки портретов */
  basePath?: string;
}

/* ---------- Свет по эмоции: ключ (тёплый, справа), контровой (холодный, слева) ---------- */

interface Lighting {
  key: string;
  keyOpacity: number;
  rim: string;
  rimOpacity: number;
  /** Наклон головы, градусы */
  tilt: number;
  /** Сдвиг головы по вертикали */
  lift: number;
}

const BASE_LIGHT: Lighting = {
  key: "#ffb547",
  keyOpacity: 0.62,
  rim: "#2ee6c5",
  rimOpacity: 0.8,
  tilt: 0,
  lift: 0,
};

const EMOTION_LIGHT: Record<Emotion, Partial<Lighting>> = {
  neutral: {},
  happy: { keyOpacity: 0.85, tilt: -2, lift: -2 },
  sad: { keyOpacity: 0.28, tilt: 4, lift: 4 },
  angry: { key: "#ff6a2b", keyOpacity: 0.82, lift: 2 },
  scared: { rim: "#8b5cf6", keyOpacity: 0.3, tilt: -3, lift: 3 },
  surprised: { keyOpacity: 0.72, lift: -5 },
  smug: { keyOpacity: 0.72, tilt: -5 },
  thinking: { keyOpacity: 0.48, tilt: 6 },
  tired: { keyOpacity: 0.32, rimOpacity: 0.6, tilt: 3, lift: 4 },
  hurt: { key: "#ff6a2b", keyOpacity: 0.5, tilt: 5, lift: 2 },
};

/* ---------- Силуэт: голова и плечи, три варианта по id персонажа ---------- */

const TORSO =
  "M12 300 C14 250 38 214 80 205 C87 203 89 196 89 170 L111 170 C111 196 113 203 120 205 C162 214 186 250 188 300 Z";
const HEAD =
  "M67 120 C67 93 81 78 100 78 C119 78 133 93 133 120 C133 145 120 165 100 167 C80 165 67 145 67 120 Z";

const HAIR_BACK: Record<number, string | null> = {
  0: null,
  // длинные волосы
  1: "M61 118 C57 82 79 64 101 64 C127 64 146 84 141 120 C145 150 150 184 158 210 C141 205 129 196 125 180 L75 180 C71 196 59 205 42 210 C51 184 56 150 61 118 Z",
  // капюшон парки
  2: "M54 132 C48 84 74 56 100 56 C126 56 152 84 146 132 C146 164 136 186 120 196 L80 196 C64 186 54 164 54 132 Z",
};

const HAIR_FRONT: Record<number, string | null> = {
  // короткая стрижка
  0: "M64 121 C59 88 78 68 102 68 C127 68 142 88 137 118 C131 103 122 94 108 92 C95 99 80 97 70 106 C67 111 65 116 64 121 Z",
  // чёлка
  1: "M66 116 C64 86 82 70 102 70 C124 70 138 86 135 114 C126 98 114 90 98 92 C86 96 74 104 66 116 Z",
  // меховая оторочка капюшона
  2: "M44 232 C38 200 58 176 84 172 L116 172 C142 176 162 200 156 232 C142 214 122 206 100 206 C78 206 58 214 44 232 Z",
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ASPECT: Record<PortraitSize, string> = {
  dialogue: "aspect-[2/3]",
  avatar: "aspect-square",
  card: "aspect-[3/4]",
};

export function PortraitFrame({
  character,
  emotion,
  size = "dialogue",
  className,
  speaking = false,
  dimmed = false,
  showEmotion,
  showName,
  basePath = "/portraits",
}: PortraitFrameProps) {
  useMediaCacheVersion();
  const imgRef = useRef<HTMLImageElement>(null);

  const mood: Emotion = emotion ?? character?.emotions[0] ?? "neutral";
  const accent = character?.accent ?? "#8593b0";

  // Кандидаты: нужная эмоция → основная эмоция персонажа. Пропавшие не повторяем.
  const candidates: string[] = [];
  if (character) {
    candidates.push(portraitUrl(character.id, mood, basePath));
    const primary = character.emotions[0] ?? "neutral";
    if (primary !== mood) candidates.push(portraitUrl(character.id, primary, basePath));
  }
  const src = candidates.find((url) => !isMediaMissing(url)) ?? null;

  // Ошибка могла случиться до гидрации — onError тогда не сработает.
  useEffect(() => {
    const img = imgRef.current;
    if (src && img && img.complete && img.naturalWidth === 0) markMediaMissing(src);
  }, [src]);

  const withEmotion = showEmotion ?? size === "dialogue";
  const withName = showName ?? size === "card";

  return (
    <figure
      className={cn(
        "group/portrait relative isolate m-0 overflow-hidden bg-[#080c18] [container-type:inline-size]",
        ASPECT[size],
        size === "avatar" ? "rounded-md" : "rounded-lg",
        "ring-1 ring-frost-line transition-[filter,box-shadow,opacity] duration-500",
        speaking && "ring-(--accent-c)/70 shadow-[0_0_0_1px_var(--accent-c),0_18px_60px_-20px_var(--accent-c)]",
        dimmed && "brightness-[0.55] saturate-[0.6]",
        className
      )}
      style={{ "--accent-c": accent } as CSSProperties}
      aria-label={character ? `${character.name} — ${EMOTION_LABELS[mood]}` : "Неизвестный"}
    >
      <PortraitPlaceholder
        character={character}
        mood={mood}
        accent={accent}
        size={size}
      />

      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- портреты из public/, размер задаёт рамка
        <img
          ref={imgRef}
          key={src}
          src={src}
          alt={character ? `${character.name}, ${EMOTION_LABELS[mood]}` : ""}
          className="absolute inset-0 z-10 size-full object-cover text-transparent motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700"
          draggable={false}
          decoding="async"
          onError={() => markMediaMissing(src)}
        />
      )}

      {/* Кромка рамки поверх всего: лёгкий внутренний свет */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04),inset_0_-40px_60px_-30px_rgb(0_0_0/0.7)]"
      />

      {!src && withEmotion && (
        <figcaption className="absolute right-[4cqw] bottom-[4cqw] z-30 rounded-sm bg-ink-deep/75 px-[2.4cqw] py-[1cqw] font-mono text-[max(9px,4.2cqw)] lowercase leading-none text-frost backdrop-blur-sm">
          {EMOTION_LABELS[mood]}
        </figcaption>
      )}

      {withName && character && (
        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink-deep via-ink-deep/85 to-transparent px-[6cqw] pt-[14cqw] pb-[5cqw]">
          <div className="font-display text-[max(11px,7cqw)] font-semibold leading-tight text-(--accent-c)">
            {character.shortName}
          </div>
          <div className="mt-[1cqw] line-clamp-2 text-[max(10px,5cqw)] leading-snug text-frost">
            {character.role}
          </div>
        </div>
      )}
    </figure>
  );
}

/* ---------- Заглушка «в стиле»: живописный силуэт со сплит-светом ---------- */

function PortraitPlaceholder({
  character,
  mood,
  accent,
  size,
}: {
  character?: CharacterDef | null;
  mood: Emotion;
  accent: string;
  size: PortraitSize;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const light = { ...BASE_LIGHT, ...EMOTION_LIGHT[mood] };
  const variant = character ? hashId(character.id) % 3 : 0;
  const initials = character ? initialsOf(character.name) : "?";
  const headTransform = `rotate(${light.tilt} 100 175) translate(0 ${light.lift})`;
  const isAvatar = size === "avatar";

  const parts: Array<{ d: string; head: boolean }> = [];
  const back = HAIR_BACK[variant];
  if (back) parts.push({ d: back, head: true });
  parts.push({ d: TORSO, head: false });
  parts.push({ d: HEAD, head: true });
  const front = HAIR_FRONT[variant];
  if (front) parts.push({ d: front, head: variant !== 2 });

  const shapes = (props: { fill?: string; transform?: string }) =>
    parts.map((p, i) => (
      <path
        key={i}
        d={p.d}
        fill={props.fill}
        transform={[props.transform, p.head ? headTransform : undefined].filter(Boolean).join(" ") || undefined}
      />
    ));

  return (
    <div aria-hidden className="absolute inset-0">
      {/* Фон: акцентное свечение + холод слева + тепло справа */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(70% 55% at 62% 34%, ${accent}40, transparent 70%)`,
            "linear-gradient(90deg, rgb(46 230 197 / 0.14), transparent 32%, transparent 64%, rgb(255 181 71 / 0.14))",
            "linear-gradient(180deg, #0d1427 0%, #080c18 70%, #05070f 100%)",
          ].join(","),
        }}
      />

      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 200 300"
        preserveAspectRatio={isAvatar ? "xMidYMid slice" : "xMidYMax slice"}
      >
        <defs>
          <filter id={`${uid}-paint`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed={variant + 3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
          <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <linearGradient id={`${uid}-base`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2240" />
            <stop offset="0.55" stopColor="#0e1428" />
            <stop offset="1" stopColor="#070a14" />
          </linearGradient>
          <linearGradient id={`${uid}-key`} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor={light.key} stopOpacity={light.keyOpacity} />
            <stop offset="0.32" stopColor={light.key} stopOpacity={light.keyOpacity * 0.45} />
            <stop offset="0.55" stopColor={light.key} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}-shade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.65" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>{shapes({})}</clipPath>
        </defs>

        {/* Мазки кистью */}
        <g filter={`url(#${uid}-soft)`} opacity="0.5">
          <path d="M-10 70 C40 40 120 30 210 60" stroke={accent} strokeOpacity="0.35" strokeWidth="26" fill="none" />
          <path d="M150 300 C160 230 190 200 220 190" stroke={light.key} strokeOpacity="0.28" strokeWidth="30" fill="none" />
          <path d="M-20 260 C10 220 30 210 50 160" stroke={light.rim} strokeOpacity="0.22" strokeWidth="22" fill="none" />
        </g>

        {/* Ореол контрового света за силуэтом */}
        <g filter={`url(#${uid}-soft)`} opacity="0.3">
          {shapes({ fill: light.rim, transform: "translate(-4 0)" })}
        </g>

        {/* Силуэт: контровой холодный край слева, тёплый ключ справа */}
        <g filter={`url(#${uid}-paint)`}>
          <g clipPath={`url(#${uid}-clip)`}>
            <rect width="200" height="300" fill={light.rim} opacity={light.rimOpacity} />
            {shapes({ fill: `url(#${uid}-base)`, transform: "translate(2.6 0.5)" })}
            <rect width="200" height="300" fill={`url(#${uid}-key)`} style={{ mixBlendMode: "screen" }} />
            <ellipse
              cx="121"
              cy="118"
              rx="15"
              ry="30"
              fill={light.key}
              opacity={light.keyOpacity * 0.45}
              transform={headTransform}
              filter={`url(#${uid}-soft)`}
            />
            <rect width="200" height="300" fill={`url(#${uid}-shade)`} />
          </g>
        </g>
      </svg>

      {/* Инициалы: водяной знак на высоких рамках, главный знак на аватаре */}
      {isAvatar ? (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-deep/35">
          <span className="font-display text-[34cqw] font-bold leading-none tracking-tight text-steam/90 [text-shadow:0_0_12px_rgb(0_0_0/0.6)]">
            {initials}
          </span>
        </div>
      ) : (
        <span
          className="absolute top-[4cqw] left-[5cqw] font-display text-[22cqw] font-black leading-none tracking-tight opacity-20"
          style={{ color: accent }}
        >
          {initials}
        </span>
      )}

      {/* Зерно и виньетка */}
      <div className="absolute inset-0 bg-grain opacity-[0.09] mix-blend-overlay" />
      <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_55%_40%,transparent_50%,rgb(2_4_10/0.7)_100%)]" />
    </div>
  );
}
