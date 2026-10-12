"use client";

import type { CSSProperties, ReactNode } from "react";
import type { EvidenceCardData, EvidenceKind } from "@/types/ui";
import { cn } from "@/lib/utils";
import { StickyNote } from "@/components/kit/paper";
import { hashId, typo } from "@/components/kit/typo";

/**
 * Виды улик. Цвета и значков у видов нет: вид определяется кодом в реестре
 * и форматом предмета на стене (раздел 7.11–7.12).
 */
export const EVIDENCE_KIND_META: Record<
  EvidenceKind,
  { label: string; plural: string; code: string; group: "data" | "people" | "docs" }
> = {
  record: { label: "Запись БД", plural: "Записи", code: "БД", group: "data" },
  photo: { label: "Фото", plural: "Фото", code: "ФОТО", group: "people" },
  audio: { label: "Аудиозапись", plural: "Аудио", code: "АУДИО", group: "people" },
  testimony: { label: "Показания", plural: "Показания", code: "ПОКАЗ", group: "people" },
  document: { label: "Документ", plural: "Документы", code: "ДОК", group: "docs" },
  lead: { label: "Заметка", plural: "Заметки", code: "ЗАМ", group: "docs" },
};

/** Ширина предмета на стене по виду, px (раздел 7.12) */
export const EVIDENCE_ITEM_WIDTH: Record<EvidenceKind, number> = {
  record: 280,
  photo: 240,
  audio: 240,
  testimony: 240,
  document: 220,
  lead: 120,
};

export interface EvidenceCardProps {
  card: EvidenceCardData;
  /** Без подписи и служебных строк */
  compact?: boolean;
  selected?: boolean;
  /** Если задан — предмет становится кнопкой */
  onSelect?: (id: string) => void;
  /** Двойной клик / Enter по выбранному */
  onActivate?: (id: string) => void;
  /** Устарело: каскадов появления нет */
  index?: number;
  /** Устарело: клавиши-чипы не показываются, цифры 1–9 работают без подписи */
  hotkey?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Улика как бумажный предмет: распечатка ленты, кадр камеры, фото, расшифровка,
 * протокол опроса, фрагмент бланка, стикер. Радиус 0, бумага, тонер.
 */
export function EvidenceCard({
  card,
  compact = false,
  selected = false,
  onSelect,
  onActivate,
  className,
  style,
}: EvidenceCardProps) {
  const body = <EvidenceItem card={card} compact={compact} />;
  const shared = cn(
    "relative block text-left",
    selected && "outline outline-1 outline-offset-[3px] outline-ink-1",
    className
  );

  if (onSelect) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${EVIDENCE_KIND_META[card.kind].label}: ${card.title}`}
        onClick={() => onSelect(card.id)}
        onDoubleClick={() => onActivate?.(card.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && selected && onActivate) {
            e.preventDefault();
            onActivate(card.id);
          }
        }}
        className={cn(shared, "cursor-pointer focus-visible:outline-offset-[3px]")}
        style={style}
      >
        {body}
      </button>
    );
  }
  return (
    <article aria-label={`${EVIDENCE_KIND_META[card.kind].label}: ${card.title}`} className={shared} style={style}>
      {body}
    </article>
  );
}

function EvidenceItem({ card, compact }: { card: EvidenceCardData; compact: boolean }) {
  switch (card.kind) {
    case "record":
      return <Printout card={card} compact={compact} />;
    case "photo":
      return card.camera ? <CameraFrame card={card} compact={compact} /> : <PhotoPrint card={card} compact={compact} />;
    case "audio":
      return <Transcript card={card} />;
    case "testimony":
      return <Testimony card={card} />;
    case "document":
      return <FormFragment card={card} />;
    case "lead":
      return (
        <StickyNote id={card.id} rotate={0} className="shadow-none">
          {card.title}
        </StickyNote>
      );
  }
}

/* ---------- Запись БД: отрывок ленты принтера ---------- */

function Printout({ card, compact }: { card: EvidenceCardData; compact: boolean }) {
  const ex = card.excerpt;
  const widths = ex
    ? ex.columns.map((c, i) => Math.max(c.length, ...ex.rows.map((r) => String(r[i] ?? "NULL").length)))
    : [];
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const head = card.queryNo !== undefined ? `> запрос № ${card.queryNo}` : "> запрос";
  return (
    <div className="w-[280px] paper-2 pt-2.5 pb-4 font-mono toner">
      <p className="px-3 text-[9px] leading-3 text-print-2">
        {head}
        {card.foundAt ? `  ${card.foundAt}` : ""}
      </p>
      {ex ? (
        <div className="mt-1.5 overflow-hidden px-3 text-[11px] leading-4 whitespace-pre text-print">
          <div>{ex.columns.map((c, i) => pad(c, widths[i])).join("  ")}</div>
          <div aria-hidden>{"—".repeat(Math.min(34, widths.reduce((a, b) => a + b + 2, -2)))}</div>
          {ex.rows.map((row, r) => (
            <div key={r}>
              {row.map((v, c) => {
                const text = pad(v === null ? "NULL" : String(v), widths[c]);
                const marked = ex.mark && ex.mark[0] === r && ex.mark[1] === c;
                return (
                  <span key={c}>
                    {c > 0 && "  "}
                    {marked ? <mark className="bg-sticky text-print mix-blend-multiply">{text.trimEnd()}</mark> : text.trimEnd()}
                    {marked ? " ".repeat(text.length - text.trimEnd().length) : ""}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 px-3 text-[11px] leading-4 text-print">{typo(card.text)}</p>
      )}
      {!compact && card.title && (
        <p className="mt-2 px-3 text-[11px] leading-4 text-print-2">{card.title}</p>
      )}
      {/* Нижний край — оторван по перфорации: ровная пунктирная линия */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-1.5 h-px"
        style={{ backgroundImage: "linear-gradient(90deg, var(--print-3) 50%, transparent 50%)", backgroundSize: "6px 1px" }}
      />
    </div>
  );
}

/* ---------- Кадр камеры: распечатка на офисной бумаге, серый полутон ---------- */

function Halftone({ className, image, color = false }: { className?: string; image?: string; color?: boolean }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ассет улики из public/, размер задаёт предмет
      <img src={image} alt="" className={cn("block object-cover", !color && "grayscale", className)} draggable={false} />
    );
  }
  // Изображения нет: ночной кадр, напечатанный тонером, — тёмное поле, светлее к земле.
  // Зерно даёт фактура бумаги под ним (multiply), а не шум кодом
  return (
    <span
      aria-hidden
      className={cn("block", className)}
      style={{
        backgroundColor: color ? "#3f4747" : "#57544e",
        backgroundImage: color
          ? "linear-gradient(180deg, #2c3335 0%, #3f4747 58%, #6a6d68 100%), url(/textures/paper-office.webp)"
          : "linear-gradient(180deg, #46433e 0%, #57544e 60%, #7d7970 100%), url(/textures/paper-office.webp)",
        backgroundSize: "100% 100%, 512px",
        backgroundBlendMode: "multiply",
      }}
    />
  );
}

function CameraFrame({ card, compact }: { card: EvidenceCardData; compact: boolean }) {
  return (
    <figure className="m-0 w-[260px] paper p-2.5">
      <div className="relative">
        <Halftone image={card.image} className="h-[180px] w-[240px]" />
        <span className="absolute top-1.5 left-2 font-mono text-[11px] leading-4 text-paper-photo">{card.camera}</span>
      </div>
      {!compact && (
        <figcaption className="mt-2 font-serif text-[12px] leading-4 text-print-2 toner">
          {typo(card.caption ?? card.title)}
        </figcaption>
      )}
    </figure>
  );
}

/* ---------- Личное фото: фотобумага, поля 8/8/24, подпись ручкой ---------- */

function PhotoPrint({ card, compact }: { card: EvidenceCardData; compact: boolean }) {
  return (
    <figure className="m-0 w-[216px] bg-paper-photo px-2 pt-2 pb-1">
      <Halftone image={card.image} color className="h-[150px] w-[200px]" />
      <figcaption className="flex h-6 items-center font-serif text-[13px] leading-4 text-pen italic">
        {!compact && typo(card.caption ?? card.title)}
      </figcaption>
    </figure>
  );
}

/* ---------- Аудио: расшифровка с полосой волны из данных ---------- */

function waveOf(card: EvidenceCardData): number[] {
  if (card.waveform?.length) return card.waveform;
  // Детерминированная огибающая по id, если данных нет
  let h = hashId(card.id);
  return Array.from({ length: 72 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    const env = Math.sin((i / 71) * Math.PI) * 0.7 + 0.3;
    return ((h % 1000) / 1000) * env;
  });
}

function Transcript({ card }: { card: EvidenceCardData }) {
  const wave = waveOf(card);
  const step = 216 / Math.max(1, wave.length - 1);
  const top = wave.map((v, i) => `${(i * step).toFixed(1)},${(12 - v * 11).toFixed(1)}`).join(" ");
  const bottom = [...wave]
    .reverse()
    .map((v, i) => `${((wave.length - 1 - i) * step).toFixed(1)},${(12 + v * 11).toFixed(1)}`)
    .join(" ");
  return (
    <div className="min-h-[160px] w-[240px] paper-thin p-3 font-serif toner">
      <p className="text-[12px] leading-4 font-bold">
        Расшифровка аудиозаписи{card.duration ? ` ${card.duration}` : ""}
      </p>
      <svg viewBox="0 0 216 24" className="mt-2 h-6 w-[216px] text-print-2" aria-hidden>
        <polygon points={`${top} ${bottom}`} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-2 line-clamp-4 text-[13px] leading-[19px]">{typo(card.text)}</p>
    </div>
  );
}

/* ---------- Показания: лист протокола опроса ---------- */

function Testimony({ card }: { card: EvidenceCardData }) {
  return (
    <div className="min-h-[200px] w-[240px] paper-thin p-3 font-serif toner">
      <p className="text-[12px] leading-4 font-bold">Из протокола опроса</p>
      <p className="mt-2 line-clamp-5 text-[13px] leading-[19px]">{typo(card.text)}</p>
      <p className="mt-2 text-right text-[12px] leading-4 text-print-2">—&nbsp;{card.author ?? card.source ?? "опрошенный"}</p>
      <div className="mt-5 flex items-end gap-2">
        <span className="h-px flex-1 bg-print-3" />
      </div>
      <p className="text-center text-[11px] leading-[14px] text-print-2 italic">(подпись)</p>
    </div>
  );
}

/* ---------- Документ: фрагмент бланка, остальное — серые линейки ---------- */

function FormFragment({ card }: { card: EvidenceCardData }) {
  return (
    <div className="flex h-[280px] w-[220px] flex-col paper p-3 font-serif toner">
      <p className="text-right text-[10px] leading-3 text-print-2">{card.source ?? "служебный документ"}</p>
      <p className="mt-2 text-center text-[11px] leading-[14px] font-bold tracking-[0.04em] uppercase">{card.title}</p>
      <span aria-hidden className="mt-2 h-px bg-print-3" />
      <Lines count={2} />
      <p className="mt-1.5 text-[12px] leading-[18px]">{typo(card.text)}</p>
      <Lines count={6} />
    </div>
  );
}

function Lines({ count }: { count: number }): ReactNode {
  return (
    <span aria-hidden className="mt-2 flex flex-col gap-[9px]">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-px bg-print-3/60" style={{ width: `${[100, 92, 97, 84, 100, 63][i % 6]}%` }} />
      ))}
    </span>
  );
}
