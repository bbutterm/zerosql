"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { CharacterDef, Emotion } from "@/types/story";
import { cn } from "@/lib/utils";
import { hashId } from "@/components/kit/typo";
import {
  isMediaMissing,
  markMediaMissing,
  portraitUrl,
  useMediaCacheVersion,
} from "./media-cache";

export type PortraitSize = "dialogue" | "avatar" | "card";

/** Подписи эмоций для читалки экрана. Ключи — строки: набор эмоций в контенте растёт */
export const EMOTION_LABELS: Record<string, string> = {
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
  uneasy: "тревога",
  ashamed: "стыд",
  broken: "надлом",
  cold: "холодно",
  shaken: "потрясение",
  determined: "решимость",
  lie: "ложь",
};

const emotionLabel = (e: Emotion): string => EMOTION_LABELS[e] ?? e;

/** Год мира игры: из возраста персонажа вычисляется год рождения в учётной карточке */
const WORLD_YEAR = 2026;

export interface PortraitFrameProps {
  /** Персонаж; без него — пустая карточка */
  character?: CharacterDef | null;
  emotion?: Emotion;
  /** dialogue — зона портрета в сцене, card — карточка 3:4, avatar — малый размер (только имя) */
  size?: PortraitSize;
  className?: string;
  /** Говорит: brightness(1) */
  speaking?: boolean;
  /** Слушает: живопись — brightness(.72) saturate(.85), бумажная карточка — только brightness(.92) */
  dimmed?: boolean;
  /** Устарело: подписи эмоций нет */
  showEmotion?: boolean;
  /** Устарело: имя всегда в карточке */
  showName?: boolean;
  /** Корень папки портретов */
  basePath?: string;
}

/** Устарело: аватаров из инициалов нет. Оставлено для совместимости импорта */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Портрет (раздел 7.15): масляная живопись 3:4, радиус 0, без рамки, сливается с комнатой.
 * Цепочка: эмоция → neutral → бумажная учётная карточка (предмет, а не силуэт).
 * Говорит / слушает — только яркость, 200 мс. Колец, свечения и наклонов нет.
 */
export function PortraitFrame({
  character,
  emotion,
  size = "dialogue",
  className,
  speaking = false,
  dimmed = false,
  basePath = "/portraits",
}: PortraitFrameProps) {
  useMediaCacheVersion();
  const imgRef = useRef<HTMLImageElement>(null);

  const mood: Emotion = emotion ?? "neutral";
  const candidates: string[] = [];
  if (character) {
    candidates.push(portraitUrl(character.id, mood, basePath));
    if (mood !== "neutral") candidates.push(portraitUrl(character.id, "neutral", basePath));
  }
  const src = candidates.find((url) => !isMediaMissing(url)) ?? null;

  // Ошибка могла случиться до гидрации — onError тогда не сработает
  useEffect(() => {
    const img = imgRef.current;
    if (src && img && img.complete && img.naturalWidth === 0) markMediaMissing(src);
  }, [src]);

  const listening = dimmed && !speaking;
  const light: CSSProperties = {
    filter: listening ? "brightness(.72) saturate(.85)" : "brightness(1)",
    transition: "filter 200ms var(--ease-out)",
  };
  // Бумага не «выключается»: слушающая карточка лишь чуть темнее, печать остаётся читаемой
  const paperLight: CSSProperties = {
    filter: listening ? "brightness(.92)" : "brightness(1)",
    transition: "filter 200ms var(--ease-out)",
  };

  if (size === "avatar") {
    // Малые размеры портретов не используют: человек обозначается именем
    return (
      <span className={cn("inline-flex items-center ui-13 text-ink-2", className)}>
        {character?.shortName ?? "—"}
      </span>
    );
  }

  return (
    <figure
      className={cn(
        "relative isolate m-0 overflow-hidden",
        size === "card" ? "aspect-[3/4] w-full" : "size-full [container-type:size]",
        className
      )}
      aria-label={character ? `${character.name}, ${emotionLabel(mood)}` : "Портрета нет"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- портреты из public/, размер задаёт зона
        <img
          ref={imgRef}
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 size-full object-cover text-transparent"
          style={{
            ...light,
            objectPosition: size === "dialogue" ? "var(--portrait-pos, 50% 18%)" : "50% 18%",
            animation: "zs-fade-in 160ms linear both",
          }}
          draggable={false}
          decoding="async"
          onError={() => markMediaMissing(src)}
        />
      ) : size === "card" ? (
        <div className="absolute inset-0" style={paperLight}>
          <DossierCard character={character} />
        </div>
      ) : (
        // Карточка лежит на столе перед игроком: низко и слева, −0,8°. Узкая зона — по центру
        <div
          className="absolute inset-x-0 bottom-[var(--dossier-bottom,40px)] flex justify-center px-6 @min-[480px]:justify-start @min-[480px]:pl-14"
          style={paperLight}
        >
          {/* До 440×586; в низкой зоне (мобильный, 42 % высоты) карточка уменьшается по высоте */}
          <div
            className="-rotate-[0.8deg] shadow-paper"
            style={{ width: "min(440px, 100cqw - 48px, (100cqh - var(--dossier-bottom, 40px) - 40px) * 0.75)" }}
          >
            <DossierCard character={character} />
          </div>
        </div>
      )}
    </figure>
  );
}

/* ---------- Учётная карточка: заглушка портрета ---------- */

/** «Имя Отчество Фамилия» → фамилия и «Имя Отчество»; отчество из CharacterDef — только если его нет в name */
export function splitName(c: Pick<CharacterDef, "name" | "patronymic">) {
  const parts = c.name.trim().split(/\s+/);
  const surname = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const given = parts.length > 1 ? parts.slice(0, -1) : [];
  if (c.patronymic && !given.includes(c.patronymic)) given.push(c.patronymic);
  return { surname, given: given.join(" ") };
}

/** Размеры заданы для листа 360×480 и масштабируются вместе с карточкой (единица --u) */
const u = (px: number) => `calc(var(--u) * ${px})`;

export function DossierCard({ character, className }: { character?: CharacterDef | null; className?: string }) {
  const name = character ? splitName(character) : null;
  const no = character ? String((hashId(character.id) % 9000) + 100).padStart(4, "0") : "—";
  const year = character?.age ? String(WORLD_YEAR - character.age) : "";

  return (
    <div className={cn("aspect-[3/4] w-full paper toner [container-type:inline-size]", className)}>
      <div className="flex h-full flex-col" style={{ "--u": "calc(100cqw / 360)", padding: u(20) } as CSSProperties}>
        <div className="flex items-baseline justify-between">
          <span className="font-serif font-bold tracking-[0.04em] uppercase" style={{ fontSize: u(13), lineHeight: u(18) }}>
            Учётная карточка
          </span>
          <span className="font-mono text-print-2" style={{ fontSize: u(11), lineHeight: u(16) }}>
            №&nbsp;{no}
          </span>
        </div>
        <span className="block bg-print-3" style={{ height: 1, marginTop: u(8) }} />

        <div className="grid" style={{ gridTemplateColumns: `${u(120)} 1fr`, columnGap: u(16), marginTop: u(16) }}>
          <div
            className="flex items-center justify-center border border-print-3 text-center font-serif text-print-2"
            style={{ height: u(160), fontSize: u(11), lineHeight: u(14), padding: u(8) }}
          >
            Место для фотографии 3×4
          </div>
          <div className="flex flex-col" style={{ gap: u(10), paddingTop: u(2) }}>
            <Field label="Фамилия" mono value={name?.surname.toUpperCase()} />
            <Field label="Имя, отчество" mono value={name?.given} />
            <Field label="Год рождения" mono value={year} />
          </div>
        </div>

        <div style={{ marginTop: u(14) }}>
          <Field label="Должность, место работы" value={character?.role} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col" style={{ marginTop: u(12) }}>
          <span className="block font-serif text-print-2 italic" style={{ fontSize: u(11), lineHeight: u(14) }}>
            Примечание
          </span>
          {/* Рука предшественницы поверх линеек бланка */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div aria-hidden className="absolute inset-0 flex flex-col">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="block shrink-0 border-b border-print-3" style={{ height: u(28) }} />
              ))}
            </div>
            <p
              className="relative font-script text-pencil"
              style={{ fontSize: u(20), lineHeight: u(28), paddingTop: u(1) }}
            >
              {character?.dossierNote ?? "\u00A0"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2" style={{ columnGap: u(16), marginTop: u(10) }}>
          <Field label="Заполнил" />
          <Field label="Дата заполнения" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <div
        className={cn("border-b border-print-3", mono ? "font-mono" : "font-serif")}
        style={{ fontSize: u(13), lineHeight: u(22), minHeight: u(22) }}
      >
        {value || " "}
      </div>
      <span className="block font-serif text-print-2 italic" style={{ fontSize: u(11), lineHeight: u(14) }}>
        {label}
      </span>
    </div>
  );
}
