"use client";

import { useMemo, useState } from "react";
import type { EvidenceCardData } from "@/types/ui";
import { cn } from "@/lib/utils";
import { TabBar, screenButtonClass } from "@/components/kit/screen";
import { EVIDENCE_KIND_META } from "./evidence-card";

export interface EvidenceBoardProps {
  cards: EvidenceCardData[];
  /** Клик по записи: открыть предмет на стене */
  onCardClick?: (id: string) => void;
  selectedId?: string | null;
  /** Текстовые вкладки «Все | Данные | Люди | Документы» */
  filterable?: boolean;
  /** Скрыть вкладки-фильтры и подпись */
  hideHeader?: boolean;
  emptyText?: string;
  /** Ссылка «Стена» внизу реестра */
  onOpenWall?: () => void;
  className?: string;
}

type Filter = "all" | "data" | "people" | "docs";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "data", label: "Данные" },
  { id: "people", label: "Люди" },
  { id: "docs", label: "Документы" },
];

/** Минуты от начала ночи (18:00): 22:00 < 23:59 < 00:10 < 06:00 */
export function nightMinutes(at?: string): number | null {
  const m = at?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2]) - 18 * 60 + 1440) % 1440;
}

/** Порядок реестра: по времени ночи, без времени — в конце, при равенстве — как пришли */
export function sortByNight<T extends { at?: string }>(cards: T[]): T[] {
  return cards
    .map((c, i) => ({ c, i, t: nightMinutes(c.at) }))
    .sort((a, b) => (a.t ?? 9999) - (b.t ?? 9999) || a.i - b.i)
    .map((x) => x.c);
}

/**
 * Материалы (раздел 7.11): реестр улик — экранная таблица, строка 44 px в две линии.
 * Сортировка по времени ночи. Новая запись подсвечена натрием и гаснет.
 * Цветов и значков по видам нет: вид — код PT Mono (БД, ФОТО, ПОКАЗ…).
 */
export function EvidenceBoard({
  cards,
  onCardClick,
  selectedId,
  filterable = true,
  hideHeader = false,
  emptyText = "Материалов нет. Строку результата можно приобщить к делу.",
  onOpenWall,
  className,
}: EvidenceBoardProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const sorted = useMemo(() => sortByNight(cards), [cards]);
  const counts = useMemo(() => {
    const m: Record<Filter, number> = { all: cards.length, data: 0, people: 0, docs: 0 };
    for (const c of cards) m[EVIDENCE_KIND_META[c.kind].group] += 1;
    return m;
  }, [cards]);

  const visible = filter === "all" ? sorted : sorted.filter((c) => EVIDENCE_KIND_META[c.kind].group === filter);

  return (
    <section aria-label="Материалы" className={cn("flex min-w-0 flex-col", className)}>
      {!hideHeader && filterable && cards.length > 0 && (
        <TabBar
          items={FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }))}
          value={filter}
          onChange={setFilter}
          label="Вид материалов"
          size="sm"
          className="h-8 shrink-0 border-b border-line px-3 max-lg:h-10 max-lg:px-4"
        />
      )}

      {cards.length === 0 ? (
        <p className="p-3 ui-13 text-ink-3">{emptyText}</p>
      ) : visible.length === 0 ? (
        <p className="p-3 ui-13 text-ink-3">Записей нет.</p>
      ) : (
        <ol aria-label="Реестр материалов">
          {visible.map((card) => {
            const meta = EVIDENCE_KIND_META[card.kind];
            const selected = selectedId === card.id;
            return (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => onCardClick?.(card.id)}
                  aria-current={selected || undefined}
                  className={cn(
                    "grid h-11 w-full grid-cols-[40px_48px_minmax(0,1fr)] grid-rows-[20px_16px] content-center items-baseline border-b border-line px-3 text-left max-lg:h-14 max-lg:px-4",
                    selected ? "bg-scr-select" : "hover:bg-scr-raise",
                    card.isNew && !selected && "anim-wash"
                  )}
                >
                  <span className="mono-12 text-ink-2">{card.at ?? "—"}</span>
                  <span className="mono-11 text-ink-3">{meta.code}</span>
                  <span className="truncate ui-14 text-ink-1">{card.title}</span>
                  <span className="col-start-3 truncate ui-12 text-ink-3">
                    {card.source}
                    {card.queryNo !== undefined && `, запрос № ${card.queryNo}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {onOpenWall && (
        <div className="px-3 py-2">
          <button type="button" onClick={onOpenWall} className={screenButtonClass("text")}>
            Стена
          </button>
        </div>
      )}
    </section>
  );
}
