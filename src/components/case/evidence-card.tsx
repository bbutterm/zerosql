"use client";

import type { CSSProperties } from "react";
import {
  AudioLines,
  Camera,
  Database,
  FileText,
  MessageSquareQuote,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { EvidenceCardData, EvidenceKind } from "@/types/ui";
import { cn } from "@/lib/utils";

export const EVIDENCE_KIND_META: Record<
  EvidenceKind,
  { label: string; plural: string; icon: LucideIcon; color: string }
> = {
  document: { label: "Документ", plural: "Документы", icon: FileText, color: "#bccbe0" },
  record: { label: "Запись БД", plural: "Записи", icon: Database, color: "#2ee6c5" },
  photo: { label: "Фото", plural: "Фото", icon: Camera, color: "#b9a0ff" },
  audio: { label: "Аудио", plural: "Аудио", icon: AudioLines, color: "#ffb547" },
  testimony: { label: "Показания", plural: "Показания", icon: MessageSquareQuote, color: "#f3cf9a" },
  lead: { label: "Зацепка", plural: "Зацепки", icon: Search, color: "#ff6a2b" },
};

export interface EvidenceCardProps {
  card: EvidenceCardData;
  /** compact — для выбора при предъявлении: без SQL, текст в 2 строки */
  compact?: boolean;
  selected?: boolean;
  /** Если задан — карточка становится кнопкой */
  onSelect?: (id: string) => void;
  /** Двойной клик / Enter по выбранной */
  onActivate?: (id: string) => void;
  /** Порядковый номер для каскадного появления */
  index?: number;
  /** Номер-клавиша (1–9) для выбора с клавиатуры */
  hotkey?: number;
  className?: string;
}

export function EvidenceCard({
  card,
  compact = false,
  selected = false,
  onSelect,
  onActivate,
  index = 0,
  hotkey,
  className,
}: EvidenceCardProps) {
  const meta = EVIDENCE_KIND_META[card.kind];
  const Icon = meta.icon;
  const interactive = Boolean(onSelect);

  const body = (
    <>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-(--kind-c) opacity-80" />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 size-36 rounded-full bg-(--kind-c) opacity-[0.07] blur-2xl"
      />

      <span className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-(--kind-c)/12 text-(--kind-c) ring-1 ring-(--kind-c)/25">
          <Icon className="size-3.5" />
        </span>
        <span className="font-display text-[9.5px] font-medium uppercase tracking-[0.18em] text-(--kind-c)">
          {meta.label}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {card.isNew && (
            <span className="rounded-sm bg-signal px-1.5 py-0.5 font-display text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-deep">
              новое
            </span>
          )}
          {hotkey !== undefined && (
            <span className="grid size-5 place-items-center rounded border border-frost-line-strong font-mono text-[10px] text-frost-dim">
              {hotkey}
            </span>
          )}
        </span>
      </span>

      <span className={cn("block font-semibold leading-snug text-steam", compact ? "text-sm" : "text-[15px]")}>
        {card.title}
      </span>

      <span
        className={cn(
          "block text-[13px] leading-relaxed text-frost/90",
          compact ? "line-clamp-2" : "line-clamp-4"
        )}
      >
        {card.text}
      </span>

      {!compact && (card.sourceQuery || card.source || card.foundAt) && (
        <span className="mt-auto flex flex-col gap-2.5">
          {card.sourceQuery && (
            <span className="block rounded-sm border-l-2 border-aurora/50 bg-ink-deep/80 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-aurora/90 line-clamp-3">
              {card.sourceQuery}
            </span>
          )}
          {(card.source || card.foundAt) && (
            <span className="flex items-center justify-between gap-2 border-t border-frost-line pt-2 text-[11px] text-frost-dim">
              <span className="truncate">{card.source}</span>
              {card.foundAt && <span className="shrink-0 font-mono tabular-nums">{card.foundAt}</span>}
            </span>
          )}
        </span>
      )}
    </>
  );

  const shared = cn(
    "group/evidence relative isolate flex flex-col gap-2.5 overflow-hidden rounded-lg border bg-ink-raised/90 p-3.5 text-left",
    "motion-safe:animate-card-in",
    card.isNew && "motion-safe:animate-[card-in_640ms_cubic-bezier(0.2,0.8,0.2,1)_both,new-glow_2.8s_ease-out_both]",
    selected
      ? "border-sodium/80 bg-ink-high shadow-[0_0_0_1px_var(--sodium),0_16px_40px_-18px_rgb(255_181_71/0.6)]"
      : card.isNew
        ? "border-signal/50"
        : "border-frost-line",
    className
  );

  const style = {
    "--kind-c": meta.color,
    animationDelay: `${Math.min(index, 12) * 55}ms`,
  } as CSSProperties;

  if (interactive) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect?.(card.id)}
        onDoubleClick={() => onActivate?.(card.id)}
        className={cn(
          shared,
          "cursor-pointer transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-frost-line-strong hover:bg-ink-high"
        )}
        style={style}
      >
        {body}
      </button>
    );
  }

  return (
    <article className={shared} style={style}>
      {body}
    </article>
  );
}
